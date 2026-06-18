import { AfterViewInit, ChangeDetectorRef, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';
import { PlannerApiService } from '../../core/planner-api.service';
import { LoFinanceService, LoFinanceCalculator } from '../../core/lo-finance.service';

@Component({
  selector: 'app-budget-allocation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './budget-allocation-panel.component.html',
  styleUrl: './budget-allocation-panel.component.scss'
})
export class BudgetAllocationPanelComponent implements OnChanges, OnDestroy, AfterViewInit {
  @ViewChild('tableWrap') tableWrapRef!: ElementRef<HTMLElement>;

  private dragScrolling = false;
  private dragScrollCandidate = false;
  private dragScrollStartX = 0;
  private dragScrollStartY = 0;
  private dragScrollLeft = 0;
  private dragScrollTop = 0;
  private readonly dragScrollThreshold = 4;
  private readonly dragScrollSpeed = 1.45;
  private suppressClickUntil = 0;
  private panRaf: number | null = null;
  private panLastMouseX = 0;
  private panLastMouseY = 0;
  private panDeltaX = 0;
  private panDeltaY = 0;
  private onDocumentDragOverRef: ((e: DragEvent) => void) | null = null;

  scrollToCurrentMonth() {
    if (this.anoSelecionado !== this.currentYear) return;
    const el = this.tableWrapRef?.nativeElement;
    if (!el) return;
    setTimeout(() => {
      const col = el.querySelector<HTMLElement>('th.current-month');
      if (!col) return;
      el.scrollLeft = col.offsetLeft - el.clientWidth / 2 + col.offsetWidth / 2;
    }, 50);
  }

  ngAfterViewInit() {
    this.scrollToCurrentMonth();
    const el = this.tableWrapRef?.nativeElement;
    if (!el) return;
    el.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('span.drag-handle')) return;
      this.dragScrollCandidate = true;
      this.dragScrolling = false;
      this.dragScrollStartX = e.clientX;
      this.dragScrollStartY = e.clientY;
      this.dragScrollLeft = el.scrollLeft;
      this.dragScrollTop = el.scrollTop;
    });
    el.addEventListener('mouseleave', () => {
      this.dragScrollCandidate = false;
      this.dragScrolling = false;
      el.style.cursor = '';
      el.style.userSelect = '';
    });
    el.addEventListener('mouseup', () => {
      if (this.dragScrolling) this.suppressClickUntil = Date.now() + 120;
      this.dragScrollCandidate = false;
      this.dragScrolling = false;
      el.style.cursor = '';
      el.style.userSelect = '';
    });
    el.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.dragScrollCandidate) return;
      const dx = e.clientX - this.dragScrollStartX;
      const dy = e.clientY - this.dragScrollStartY;
      if (!this.dragScrolling) {
        if ((Math.abs(dx) + Math.abs(dy)) < this.dragScrollThreshold) return;
        this.dragScrolling = true;
        this.panLastMouseX = e.clientX;
        this.panLastMouseY = e.clientY;
        this.panDeltaX = 0;
        this.panDeltaY = 0;
        this.startPanLoop();
        el.style.cursor = 'grabbing';
        el.style.userSelect = 'none';
      }
      e.preventDefault();
      this.panDeltaX += (e.clientX - this.panLastMouseX);
      this.panDeltaY += (e.clientY - this.panLastMouseY);
      this.panLastMouseX = e.clientX;
      this.panLastMouseY = e.clientY;
    });
    el.addEventListener('click', (e: MouseEvent) => {
      if (Date.now() < this.suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    this.onDocumentDragOverRef = (e: DragEvent) => {
      if (this.dragSourceIndex == null) return;
      this.dragPointerX = e.clientX;
      this.dragPointerY = e.clientY;
    };
    document.addEventListener('dragover', this.onDocumentDragOverRef);

    const stopPan = () => this.stopPanLoop();
    el.addEventListener('mouseup', stopPan);
    el.addEventListener('mouseleave', stopPan);
  }
  @Input() linhasOrcamentarias: any[] = [];
  @Input() ajustes: any[] = [];
  @Input() horasMes: any[] = [];
  @Input() perfis: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() consultorias: any[] = [];
  @Input() ausencias: any[] = [];
  @Input() alocacoes: any[] = [];
  @Input() atividades: any[] = [];
  @Input() fotos: Record<string, string> = {};
  @Input() token = '';

  fotoDe(nome: string): string {
    return this.fotos?.[this.normalized(nome || '')] || '';
  }

  iniciaisDe(nome: string): string {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    return ((partes[0][0] || '') + (partes.length > 1 ? (partes[partes.length - 1][0] || '') : '')).toUpperCase();
  }
  @Output() create = new EventEmitter<{ linhaOrcamentariaId: string; nomePessoa: string; perfilId: string; horasPlanejadas: number; draft?: boolean; mesInicio?: number; valorHora?: number | null }>();
  @Output() update = new EventEmitter<{ id: string; linhaOrcamentariaId: string; nomePessoa: string; perfilId: string; horasPlanejadas: number; draft?: boolean; mesInicio?: number; valorHora?: number | null }>();
  @Output() remove = new EventEmitter<string>();
  @Output() createPerson = new EventEmitter<{ nome: string; perfilId: string; tipoVinculo: string; consultoria: string; valorHora: number | null; valorMensal: number | null; vagaUrl: string }>();
  form = { linhaOrcamentariaId: '', nomePessoa: '', perfilId: '', horasPlanejadas: 0, valorHora: null as number | null };
  draftValorHoraMasked = '';
  editingId = '';
  novaLinhaAberta = false;

  // draft mode
  draftMode = false;
  incluirRascunhoNosTotalizadores = false;
  private incluirPlanejadaNosTotal: Record<string, boolean> = {};
  novoMesInicio = 0;
  novaPessoaSelecionadaId = '';
  pessoaEdicaoSelecionadaId = '';
  loSelecionadaId = '';
  anoSelecionado = new Date().getFullYear();
  currentYear = new Date().getFullYear();
  currentMonthIdx = new Date().getMonth();
  meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  searchTerm = '';
  searchLoTerm = '';
  pessoaNovaNome = '';
  pessoaEdicaoNome = '';
  private planoAlocacao: Record<string, { percentual: number }> = {};
  private realizadoMensal: Record<string, number> = {};
  private pagoMensal: Record<string, boolean> = {};
  private api = inject(PlannerApiService);
  private cdr = inject(ChangeDetectorRef);
  private loFinance = inject(LoFinanceService);

  /**
   * Calculadora financeira compartilhada (fonte única de verdade para Cockpit/Relatórios).
   * Aponta para os mesmos arrays/estado deste componente, então sempre lê dados atuais.
   */
  private finance(): LoFinanceCalculator {
    return this.loFinance.for({
      ano: this.anoSelecionado,
      linhasOrcamentarias: this.linhasOrcamentarias,
      ajustes: this.ajustes,
      alocacoes: this.alocacoes,
      pessoas: this.pessoas,
      perfis: this.perfis,
      horasMes: this.horasMes,
      ausencias: this.ausencias,
      percentualBase: (id) => Number(this.getConfig(id).percentual || 0),
      isCancelado: (id, m) => this.isCancelado(id, m),
      manualValue: (id, m) => this.getValorMensalManual(id, m),
      manualPercent: (id, m) => this.getPercentualMensalManual(id, m),
      isPago: (id, m) => this.isPago(id, m),
    });
  }
  private paymentsSyncTimer: ReturnType<typeof setInterval> | null = null;
  private presenceSyncTimer: ReturnType<typeof setInterval> | null = null;
  private monthlyStateSyncTimer: ReturnType<typeof setInterval> | null = null;
  private cursorSyncTimer: ReturnType<typeof setInterval> | null = null;
  private allocationPercentSyncTimer: ReturnType<typeof setInterval> | null = null;
  private loRealizadoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private lastCursorSendAt = 0;
  private latestCursorPos: { x: number; y: number } | null = null;
  cursoresOutros: Array<{ username: string; x: number; y: number }> = [];
  usuariosLoAberta: Array<{ username: string }> = [];
  private canceladoMensal: Record<string, boolean> = {};
  private valorMensalManual: Record<string, number> = {};
  private valorMensalMaskedMap: Record<string, string> = {};
  private percentualMensalManual: Record<string, number> = {};
  percentualAviso = '';
  // Quando ligado, descontos de horas por ausência/férias entram no custo (tela e extração).
  descontarAusencias = this.carregarDescontarAusencias();
  // Filtros da tabela
  filtroPerfil = '';
  filtroCategoria: '' | 'FOLHA' | 'TERCEIRO' = '';
  // Anotações por alocação (tooltip na linha da pessoa)
  private anotacoes: Record<string, string> = this.carregarAnotacoes();
  anotacaoEditId: string | null = null;
  anotacaoEditValue = '';
  novaAlocacaoPercentual = 100;
  novaPctMasked = '100,00';
  private pctMaskedMap: Record<string, string> = {};
  private pctMensalMaskedMap: Record<string, string> = {};
  pessoaModalAberto = false;
  pessoaRapida = { nome: '', perfilId: '', tipoVinculo: 'BV', consultoria: '', valorHora: null as number | null, valorMensal: null as number | null, vagaUrl: '' };
  pessoaValorHoraMasked = '';
  pessoaValorMensalMasked = '';

  private ordemPorLo: Record<string, string[]> = {};
  dragSourceIndex: number | null = null;
  dragOverIndex: number | null = null;
  private readonly dragAutoScrollEdge = 84;
  private readonly dragAutoScrollMaxStep = 18;
  private readonly dragViewportEdge = 72;
  private dragPointerX = 0;
  private dragPointerY = 0;
  private dragAutoScrollRaf: number | null = null;
  sortColuna: string | null = null;
  sortDirecao: 'asc' | 'desc' = 'asc';

  // seleção por célula (Ctrl+Click) — chave: "allocationId|monthIndex"
  selectedCells = new Set<string>();

  private cellKey(allocationId: string, month: number): string {
    return `${allocationId}|${month}`;
  }

  isCellSelected(allocationId: string, month: number): boolean {
    return this.selectedCells.has(this.cellKey(allocationId, month));
  }

  isRowPartiallySelected(allocationId: string): boolean {
    return this.meses.some((_, mi) => this.selectedCells.has(this.cellKey(allocationId, mi)));
  }

  isColPartiallySelected(monthIndex: number): boolean {
    return this.alocacoesFiltradas().some((a: any) => this.selectedCells.has(this.cellKey(a.id, monthIndex)));
  }

  onCellClick(event: MouseEvent, allocationId: string, month: number) {
    if (!event.ctrlKey && !event.metaKey) return;
    if (Date.now() < this.suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    const next = new Set(this.selectedCells);
    const k = this.cellKey(allocationId, month);
    if (next.has(k)) next.delete(k); else next.add(k);
    this.selectedCells = next;
  }

  onRowHeaderClick(event: MouseEvent, allocationId: string) {
    if (!event.ctrlKey && !event.metaKey) return;
    if (Date.now() < this.suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    const allSel = this.meses.every((_, mi) => this.selectedCells.has(this.cellKey(allocationId, mi)));
    const next = new Set(this.selectedCells);
    this.meses.forEach((_, mi) => allSel ? next.delete(this.cellKey(allocationId, mi)) : next.add(this.cellKey(allocationId, mi)));
    this.selectedCells = next;
  }

  onColHeaderClick(event: MouseEvent, monthIndex: number) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const alocs = this.alocacoesFiltradas();
    const allSel = alocs.every((a: any) => this.selectedCells.has(this.cellKey(a.id, monthIndex)));
    const next = new Set(this.selectedCells);
    alocs.forEach((a: any) => allSel ? next.delete(this.cellKey(a.id, monthIndex)) : next.add(this.cellKey(a.id, monthIndex)));
    this.selectedCells = next;
  }

  clearSelection() {
    this.selectedCells = new Set();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.selectedCells.size) this.clearSelection();
  }

  getSelectedStats() {
    if (!this.selectedCells.size) return null;
    const values: number[] = [];
    let totalH = 0;
    for (const key of this.selectedCells) {
      const pipe = key.lastIndexOf('|');
      const allocId = key.slice(0, pipe);
      const month   = Number(key.slice(pipe + 1));
      const aloc = this.alocacoes.find((a: any) => a.id === allocId);
      if (!aloc) continue;
      const vh = this.getValorHoraDaAlocacao(aloc);
      values.push(this.round2(this.custoMensal(allocId, vh, month)));
      if (!this.isCancelado(allocId, month) && !this.mesIndisponivelParaAlocacao(allocId, month)) {
        const pct = this.getPercentualEfetivoMes(allocId, month) / 100;
        const h = !!aloc.draft ? this.horasDoCadastro(month) : 168;
        totalH += this.round2(h * pct);
      }
    }
    if (!values.length) return null;
    const total = values.reduce((s, v) => s + v, 0);
    const distinctAlocs = new Set([...this.selectedCells].map(k => k.slice(0, k.lastIndexOf('|')))).size;
    return {
      count: this.selectedCells.size,
      distinctAlocs,
      total:  this.round2(total),
      media:  this.round2(total / values.length),
      max:    Math.max(...values),
      min:    Math.min(...values),
      totalH: this.round2(totalH),
    };
  }

  // transferência de dono da LO
  donoModalAberto = false;
  donoNovoInput = '';

  
  colPickerOpen = false;
  private colPrefsLoaded = false;

  
  colsVisiveis: Record<string, boolean> = {
    vaga:       true,
    perfil:     true,
    categoria:  true,
    pct:        true,
    valorH:     true,
    jan: true, fev: true, mar: true, abr: true,
    mai: true, jun: true, jul: true, ago: true,
    set: true, out: true, nov: true, dez: true,
    total:      true,
  };

  readonly colDefs: Array<{ key: string; label: string }> = [
    { key: 'vaga',      label: 'Vaga'         },
    { key: 'perfil',    label: 'Perfil'       },
    { key: 'categoria', label: 'Categoria'    },
    { key: 'pct',       label: 'Alocação %'   },
    { key: 'valorH',    label: 'Valor/h'      },
    { key: 'jan',       label: 'Jan'  },
    { key: 'fev',       label: 'Fev'  },
    { key: 'mar',       label: 'Mar'  },
    { key: 'abr',       label: 'Abr'  },
    { key: 'mai',       label: 'Mai'  },
    { key: 'jun',       label: 'Jun'  },
    { key: 'jul',       label: 'Jul'  },
    { key: 'ago',       label: 'Ago'  },
    { key: 'set',       label: 'Set'  },
    { key: 'out',       label: 'Out'  },
    { key: 'nov',       label: 'Nov'  },
    { key: 'dez',       label: 'Dez'  },
    { key: 'total',     label: 'Total anual'  },
  ];

  
  mesKey(i: number): string {
    return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][i];
  }

  toggleCol(key: string) {
    this.colsVisiveis[key] = !this.colsVisiveis[key];
    this.saveColPrefs();
  }

  toggleAllCols(value: boolean) {
    for (const k of Object.keys(this.colsVisiveis)) this.colsVisiveis[k] = value;
    this.saveColPrefs();
  }

  col(key: string): boolean { return !!this.colsVisiveis[key]; }

  primeiraColunaEhPerfil(): boolean {
    return !!(this.novaLinhaAberta && !this.editingId && (this.draftMode || this.loSelecionadaEhDraft()));
  }

  toggleColPicker() { this.colPickerOpen = !this.colPickerOpen; }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.colPrefsLoaded) {
      this.loadColPrefs();
      this.colPrefsLoaded = true;
    }
    if (changes['linhasOrcamentarias']) {
      const linhasAno = this.linhasDoAnoSelecionado();
      if (!linhasAno.length && this.linhasOrcamentarias.length) {
        this.anoSelecionado = Number(this.linhasOrcamentarias[0]?.ano || this.anoSelecionado);
      }
      const atualExiste = this.linhasDoAnoSelecionado().some((lo: any) => lo.id === this.loSelecionadaId);
      if (!atualExiste) {
        this.loSelecionadaId = this.linhasDoAnoSelecionado()[0]?.id || '';
      }
      this.form.linhaOrcamentariaId = this.loSelecionadaId;
      this.aplicarSelecaoPendenteLo();
      if (this.loSelecionadaId && !this.ordemPorLo[this.loSelecionadaId]) {
        this.ordemPorLo[this.loSelecionadaId] = this.carregarOrdemLo(this.loSelecionadaId);
      }
    }
    if (changes['alocacoes']) {

      this.aplicarConfigsPendentes();
      this.loadPagamentosDoBackend();
      this.loadAllocationPercentsFromBackend();
      this.loadAnotacoesFromBackend();
      if (this.loSelecionadaId && !this.ordemPorLo[this.loSelecionadaId]) {
        this.ordemPorLo[this.loSelecionadaId] = this.carregarOrdemLo(this.loSelecionadaId);
      }
    }
    if (changes['linhasOrcamentarias']) {
      this.loadLoRealizadoFromBackend();
    }
    if (changes['token']) {
      this.startPaymentsRealtimeSync();
      this.startPresenceRealtimeSync();
      this.startMonthlyStateRealtimeSync();
      this.startCursorRealtimeSync();
      this.startAllocationPercentRealtimeSync();
      this.startLoRealizadoRealtimeSync();
      this.loadFavoritosFromBackend();
      this.loadAnotacoesFromBackend();
    }
    if (changes['linhasOrcamentarias']) this.heartbeatLoAberta();
  }

  ngOnDestroy(): void {
    if (this.paymentsSyncTimer) {
      clearInterval(this.paymentsSyncTimer);
      this.paymentsSyncTimer = null;
    }
    if (this.presenceSyncTimer) {
      clearInterval(this.presenceSyncTimer);
      this.presenceSyncTimer = null;
    }
    if (this.monthlyStateSyncTimer) {
      clearInterval(this.monthlyStateSyncTimer);
      this.monthlyStateSyncTimer = null;
    }
    if (this.cursorSyncTimer) {
      clearInterval(this.cursorSyncTimer);
      this.cursorSyncTimer = null;
    }
    if (this.allocationPercentSyncTimer) {
      clearInterval(this.allocationPercentSyncTimer);
      this.allocationPercentSyncTimer = null;
    }
    if (this.loRealizadoSyncTimer) {
      clearInterval(this.loRealizadoSyncTimer);
      this.loRealizadoSyncTimer = null;
    }
    if (this.onDocumentDragOverRef) {
      document.removeEventListener('dragover', this.onDocumentDragOverRef);
      this.onDocumentDragOverRef = null;
    }
    this.stopPanLoop();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.token || !this.loSelecionadaId) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const x = Math.max(0, Math.min(1, event.clientX / w));
    const y = Math.max(0, Math.min(1, event.clientY / h));
    this.latestCursorPos = { x, y };
    const now = Date.now();
    if (now - this.lastCursorSendAt >= 120) this.pushCursor();
  }

  anosDisponiveis(): number[] {
    const anos = Array.from(new Set(this.linhasOrcamentarias.map((lo: any) => Number(lo?.ano || 0)).filter((a: number) => a > 0)));
    return anos.sort((a, b) => b - a);
  }

  linhasDoAnoSelecionado() {
    return this.linhasOrcamentarias.filter((lo: any) => Number(lo?.ano) === Number(this.anoSelecionado));
  }

  linhasDoAnoFiltradas() {
    const q = this.searchLoTerm.trim().toLowerCase();
    const base = q
      ? this.linhasDoAnoSelecionado().filter((lo: any) =>
          (lo.codigo || '').toLowerCase().includes(q) ||
          (lo.nome || '').toLowerCase().includes(q) ||
          (lo.tipo || '').toLowerCase().includes(q)
        )
      : this.linhasDoAnoSelecionado();
    return [...base].sort((a, b) => {
      const fa = this.isFavoritoLo(a.id) ? 0 : 1;
      const fb = this.isFavoritoLo(b.id) ? 0 : 1;
      return fa - fb;
    });
  }

  private losFavoritos = new Set<string>();

  private loadFavoritosFromBackend() {
    if (!this.token) return;
    const me = (localStorage.getItem('planner_user') || '').trim().toLowerCase();
    this.api.listLoFavoritos(this.token).subscribe({
      next: (rows: any[]) => {
        this.losFavoritos = new Set(
          (rows || [])
            .filter((r: any) => !me || (r?.username || '').trim().toLowerCase() === me)
            .map((r: any) => String(r?.loId || ''))
            .filter(Boolean)
        );
        this.cdr.markForCheck();
      }
    });
  }

  isFavoritoLo(loId: string): boolean {
    return this.losFavoritos.has(loId);
  }

  toggleFavoritoLo(loId: string) {
    const wasFav = this.losFavoritos.has(loId);
    if (wasFav) {
      this.losFavoritos.delete(loId);
      this.api.removeLoFavorito(this.token, loId).subscribe({ error: () => this.loadFavoritosFromBackend() });
    } else {
      this.losFavoritos.add(loId);
      this.api.addLoFavorito(this.token, loId).subscribe({ error: () => this.loadFavoritosFromBackend() });
    }
    this.cdr.markForCheck();
  }

  selecionarAno(ano: number) {
    this.anoSelecionado = Number(ano || new Date().getFullYear());
    const linhas = this.linhasDoAnoSelecionado();
    this.loSelecionadaId = linhas[0]?.id || '';
    this.form.linhaOrcamentariaId = this.loSelecionadaId;
  }

  private colPrefsKey(): string {
    const user = (localStorage.getItem('planner_user') || '').trim().toLowerCase();
    return user ? `planner_lo_cols_${user}` : 'planner_lo_cols_global';
  }

  private saveColPrefs() {
    try {
      localStorage.setItem(this.colPrefsKey(), JSON.stringify(this.colsVisiveis));
    } catch {}
  }

  private loadColPrefs() {
    try {
      const byUser = localStorage.getItem(this.colPrefsKey());
      const legacy = localStorage.getItem('planner_lo_cols_global');
      const raw = byUser || legacy;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (!parsed || typeof parsed !== 'object') return;
      for (const k of Object.keys(this.colsVisiveis)) {
        if (Object.prototype.hasOwnProperty.call(parsed, k)) {
          this.colsVisiveis[k] = !!parsed[k];
        }
      }
    } catch {}
  }
  
  private pendingPctKey(nomePessoa: string, loId: string): string {
    return `planner_lo_pending_pct_${this.normalized(nomePessoa)}_${loId}`;
  }

  
  private aplicarConfigsPendentes() {
    for (const a of this.alocacoes) {
      
      if (this.planoAlocacao[a.id] != null) continue;
      
      if (localStorage.getItem(`planner_lo_alloc_${a.id}`) != null) continue;

      const pendingKey = this.pendingPctKey(a.nomePessoa || '', a.linhaOrcamentariaId || '');
      const pending = localStorage.getItem(pendingKey);
      if (pending != null) {
        const pct = Math.max(0, Math.min(100, Number(pending)));
        this.planoAlocacao[a.id] = { percentual: pct };
        localStorage.setItem(`planner_lo_alloc_${a.id}`, JSON.stringify({ percentual: pct }));
        localStorage.removeItem(pendingKey);
      }
    }
  }

  private aplicarSelecaoPendenteLo() {
    const pendingLoId = localStorage.getItem('planner_pending_lo_id') || '';
    const pendingAno = Number(localStorage.getItem('planner_pending_lo_ano') || 0);
    if (!pendingLoId) return;
    if (pendingAno > 0) {
      this.anoSelecionado = pendingAno;
    }
    const linhasAno = this.linhasDoAnoSelecionado();
    const existe = linhasAno.some((lo: any) => lo.id === pendingLoId);
    if (existe) {
      this.loSelecionadaId = pendingLoId;
      this.form.linhaOrcamentariaId = pendingLoId;
    }
    localStorage.removeItem('planner_pending_lo_id');
    localStorage.removeItem('planner_pending_lo_ano');
  }

  alocacoesFiltradas() {
    const idsAno = new Set(this.linhasDoAnoSelecionado().map((lo: any) => lo.id));
    const query = this.searchTerm.trim().toLowerCase();
    const filtered = this.alocacoes.filter((a: any) => {
      if (!idsAno.has(a.linhaOrcamentariaId)) return false;
      if (this.loSelecionadaId && a.linhaOrcamentariaId !== this.loSelecionadaId) return false;
      if (!query) return true;
      return `${a?.nomePessoa ?? ''} ${a?.perfilNome ?? ''} ${a?.linhaOrcamentariaCodigo ?? ''}`.toLowerCase().includes(query);
    });

    const customOrder = !query ? (this.ordemPorLo[this.loSelecionadaId] ?? []) : [];
    if (customOrder.length) {
      return [...filtered].sort((a: any, b: any) => {
        const ia = customOrder.indexOf(a.id);
        const ib = customOrder.indexOf(b.id);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }

    if (this.sortColuna) {
      return [...filtered].sort((a: any, b: any) => this.compararPorColuna(a, b));
    }

    return [...filtered].sort((a: any, b: any) => {
      const oa = this.ordemVisualAlocacao(a);
      const ob = this.ordemVisualAlocacao(b);
      if (oa !== ob) return oa - ob;
      return String(a?.nomePessoa || '').localeCompare(String(b?.nomePessoa || ''), 'pt-BR');
    });
  }

  private ordemVisualAlocacao(a: any): number {
    if (this.pessoaSemCustoLo(a)) return 2; 
    return this.getCategoriaDaPessoa(a) === 'TERCEIRO' ? 1 : 0; 
  }

  totalComprometidoLo(): number {
    return this.alocacoesFiltradas()
      .filter((a: any) => this.alocacaoContaNoResumoLo(a))
      .reduce((acc: number, a: any) => acc + Number(a.custoPlanejado || 0), 0);
  }

  totalOrcamentoGeralLos(): number {
    return this.finance().totalOrcamentoGeralLos();
  }

  
  valorMaximoMes(a: any, monthIndex: number): number {
    const vh = this.getValorHoraDaAlocacao(a);
    if (!vh) return 0;
    const pct = this.percentualDisponivelParaLinha(a.id, monthIndex);
    const horas = this.horasEfetivas(monthIndex, this.getCategoriaDaPessoa(a), undefined, !!a.draft);
    return this.round2(vh * horas * pct / 100);
  }

  
  pessoaSemCustoLo(a: any): boolean {
    return this.getValorHoraDaAlocacao(a) === 0;
  }

  
  novaPessoaSemCustoLo(): boolean {
    return !!this.normalized(this.form.nomePessoa) && this.valorHoraPessoaSelecionadaNova() === 0;
  }

  getValorHoraDaAlocacao(a: any): number {
    // Rascunho: o valor/hora informado na linha tem prioridade (mesmo que a LO não debite).
    if (a?.draft && a?.valorHora != null) return Number(a.valorHora);
    if (!this.debitaLoDaAlocacao(a)) return 0;
    const pessoa = this.pessoas.find(
      (p: any) => this.normalized(p?.nome || '') === this.normalized(a?.nomePessoa || '')
    );
    if (pessoa?.valorHora != null) return Number(pessoa.valorHora);
    if (a?.perfilId) {
      const perfil = this.perfis.find((x: any) => x.id === a.perfilId);
      if (perfil?.valorHora != null) return Number(perfil.valorHora);
    }
    return Number(a?.valorHora || 0);
  }

  private debitaLoDaAlocacao(a: any): boolean {
    if (a?.debitaLo != null) return !!a.debitaLo;
    const pessoa = this.pessoas.find(
      (p: any) => this.normalized(p?.nome || '') === this.normalized(a?.nomePessoa || '')
    );
    const perfilId = a?.perfilId || pessoa?.perfilId;
    if (!perfilId) return true;
    const perfil = this.perfis.find((x: any) => x.id === perfilId);
    return perfil ? !!perfil.debitaLo : true;
  }

  totalComprometidoGeralLos(): number {
    return this.finance().totalComprometidoGeralLos();
  }

  comprometidoGeralPorCategoria(categoria: 'FOLHA' | 'TERCEIRO'): number {
    return this.finance().comprometidoGeralPorCategoria(categoria);
  }

  saldoGeralLos(): number {
    return this.finance().saldoGeralLos();
  }

  saldoAtualGeralLos(): number {
    return this.finance().saldoAtualGeralLos();
  }

  percentualUtilizadoGeral(): number {
    return this.finance().percentualUtilizadoGeral();
  }

  numLosAno(): number {
    return this.finance().numLosAno();
  }

  numAlocacoesAno(): number {
    return this.finance().numAlocacoesAno();
  }

  numPessoasAlocadasAno(): number {
    return this.finance().numPessoasAlocadasAno();
  }

  mediaComprometidoPorLo(): number {
    return this.finance().mediaComprometidoPorLo();
  }

  clampPct(v: number): number {
    return Math.max(0, Math.min(100, v));
  }

  totalPagoGeralLos(): number {
    return this.finance().totalPagoGeralLos();
  }

  totalPagoGeralLosPorCategoria(categoria: 'FOLHA' | 'TERCEIRO'): number {
    return this.finance().totalPagoGeralLosPorCategoria(categoria);
  }

  loSelecionada() {
    return this.linhasDoAnoSelecionado().find((lo: any) => lo.id === this.loSelecionadaId) || null;
  }

  orcamentoLoSelecionada(): number {
    const base = Number(this.loSelecionada()?.valorTotal || 0);
    const delta = this.ajustesDaLoSelecionada().reduce((acc: number, a: any) => {
      const valor = Number(a?.valor || 0);
      return acc + (String(a?.tipo || '').toUpperCase() === 'APORTE' ? valor : -valor);
    }, 0);
    return base + delta;
  }

  private ajustesDaLoSelecionada() {
    if (!this.loSelecionadaId) return [];
    return this.ajustes.filter((a: any) => a.budgetLineId === this.loSelecionadaId);
  }

  getConfig(allocationId: string) {
    if (!this.planoAlocacao[allocationId]) {
      const saved = localStorage.getItem(`planner_lo_alloc_${allocationId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.planoAlocacao[allocationId] = { percentual: Number(parsed?.percentual ?? 100) };
      } else {
        this.planoAlocacao[allocationId] = { percentual: 100 };
      }
    }
    return this.planoAlocacao[allocationId];
  }

  setPercentual(allocationId: string, value: number) {
    const cfg = this.getConfig(allocationId);
    const raw = Number(value || 0);
    const desejado = raw > 0 ? Math.max(0.01, Math.min(100, raw)) : 0;
    const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
    const percentualOutras = this.alocacoes
      .filter((a: any) => a.id !== allocationId && !a.draft && this.normalized(a.nomePessoa) === this.normalized(nomePessoa))
      .reduce((acc: number, a: any) => acc + Number(this.getConfig(a.id).percentual || 0), 0);
    const maxPermitido = Math.max(0, 100 - percentualOutras);
    cfg.percentual = Math.min(desejado, maxPermitido);
    this.percentualAviso = desejado > maxPermitido
      ? `Limite de 100% excedido para ${nomePessoa}. Ajustado para ${cfg.percentual.toFixed(2)}%.`
      : '';
    localStorage.setItem(`planner_lo_alloc_${allocationId}`, JSON.stringify(cfg));
    if (this.token) {
      this.api.upsertAllocationPercent(this.token, allocationId, cfg.percentual).subscribe({ error: () => {} });
    }
  }

  

  formatPct(value: number): string {
    return Math.min(100, Math.max(0, Number(value || 0)))
      .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private parsePctDigits(raw: string): number {
    const digits = (raw ?? '').replace(/\D/g, '');
    const int = digits ? parseInt(digits, 10) : 0;
    return Math.min(10000, int) / 100; 
  }

  
  getPctMasked(allocationId: string): string {
    return this.pctMaskedMap[allocationId] ?? this.formatPct(this.getConfig(allocationId).percentual);
  }

  onPctMaskedChange(value: string, allocationId: string) {
    this.setPercentual(allocationId, this.parsePctDigits(value));
    this.pctMaskedMap[allocationId] = this.formatPct(this.getConfig(allocationId).percentual);
  }

  
  onNovaPctMaskedChange(value: string) {
    this.setNovaAlocacaoPercentual(this.parsePctDigits(value));
    this.novaPctMasked = this.formatPct(this.novaAlocacaoPercentual);
  }

  
  getPctMensalMasked(allocationId: string, month: number): string {
    const key = `${allocationId}_${month}`;
    return this.pctMensalMaskedMap[key] ?? this.formatPct(this.getPercentualMensalDigitavel(allocationId, month));
  }

  onPctMensalMaskedChange(value: string, allocationId: string, month: number) {
    this.setPercentualMensalDigitavel(allocationId, month, this.parsePctDigits(value));
    this.pctMensalMaskedMap[`${allocationId}_${month}`] = this.formatPct(this.getPercentualMensalDigitavel(allocationId, month));
  }

  setNovaAlocacaoPercentual(value: number) {
    const raw = Number(value || 0);
    const desejado = raw > 0 ? Math.max(0.01, Math.min(100, raw)) : 0;
    const nomePessoa = this.form.nomePessoa || '';
    if (!this.normalized(nomePessoa)) {
      this.novaAlocacaoPercentual = desejado;
      this.percentualAviso = '';
      return;
    }
    const maxDisponivel = this.percentualMaximoNovaAlocacao(nomePessoa);
    this.novaAlocacaoPercentual = Math.min(desejado, maxDisponivel);
    this.percentualAviso = desejado > maxDisponivel
      ? `Percentual ajustado para ${maxDisponivel.toFixed(2)}% (limite disponivel nos meses abertos).`
      : '';
  }

  monthIndex(mes: string) {
    return this.meses.indexOf(mes);
  }

  custoMensal(allocationId: string, valorHora: number, month?: number): number {
    if (month != null && this.isCancelado(allocationId, month)) return 0;
    // Meses bloqueados por outra alocação (mesma LO ou outra LO) não geram custo
    if (month != null && this.mesIndisponivelParaAlocacao(allocationId, month)) return 0;
    if (month != null) {
      const manual = this.getValorMensalManual(allocationId, month);
      if (manual != null) return manual;
    }
    const mi = month ?? new Date().getMonth();
    const percentual = this.getPercentualEfetivoMes(allocationId, mi);
    const isDraftAloc = !!(this.alocacoes.find((a: any) => a.id === allocationId)?.draft);
    // Passa o nome da pessoa para que o desconto de ausências (quando ligado) também afete os totais.
    const horas = this.horasEfetivas(mi, this.categoriaDaAlocacaoId(allocationId), this.nomePessoaDaAlocacao(allocationId), isDraftAloc);
    return (valorHora || 0) * horas * (percentual / 100);
  }

  totalComprometidoMesLo(month: number): number {
    if (month < 0 || month > 11) return 0;
    return this.alocacoesFiltradas()
      .filter((a: any) => this.alocacaoContaNoResumoLo(a))
      .reduce((acc: number, a: any) => {
      return acc + this.round2(this.custoMensal(a.id, this.getValorHoraDaAlocacao(a), month));
      }, 0);
  }

  totalComprometidoMesPorCategoria(month: number, categoria: 'FOLHA' | 'TERCEIRO'): number {
    if (month < 0 || month > 11) return 0;
    return this.alocacoesFiltradas()
      .filter((a: any) => this.alocacaoContaNoResumoLo(a))
      .filter((a: any) => this.getCategoriaDaPessoa(a) === categoria)
      .reduce((acc: number, a: any) => acc + this.round2(this.custoMensal(a.id, this.getValorHoraDaAlocacao(a), month)), 0);
  }

  // Realizado (pago) por mês e categoria — base para "Realizado Folha/CLM".
  realizadoMesPorCategoria(month: number, categoria: 'FOLHA' | 'TERCEIRO'): number {
    if (month < 0 || month > 11) return 0;
    return this.alocacoesFiltradas()
      .filter((a: any) => this.alocacaoContaNoResumoLo(a))
      .filter((a: any) => this.getCategoriaDaPessoa(a) === categoria)
      .reduce((acc: number, a: any) => {
        if (!this.isPago(a.id, month)) return acc;
        return acc + this.round2(this.custoMensal(a.id, this.getValorHoraDaAlocacao(a), month));
      }, 0);
  }

  // Eficiência = movimentações negativas na LO (ajustes que não são aporte).
  eficienciaLoSelecionada(): number {
    return this.ajustesDaLoSelecionada().reduce((acc: number, a: any) => {
      const tipo = String(a?.tipo || '').toUpperCase();
      if (tipo === 'APORTE' || tipo === 'CREDITO') return acc;
      return acc + Number(a?.valor || 0);
    }, 0);
  }

  totalComprometidoClm(): number {
    return this.meses.reduce((acc, m) => acc + this.totalComprometidoMesLo(this.monthIndex(m)), 0);
  }

  totalComprometidoClmPorCategoria(categoria: 'FOLHA' | 'TERCEIRO'): number {
    return this.meses.reduce((acc, m) => acc + this.totalComprometidoMesPorCategoria(this.monthIndex(m), categoria), 0);
  }

  getRealizadoMes(month: number): number {
    if (!this.loSelecionadaId) return 0;
    const key = `planner_lo_realizado_${this.loSelecionadaId}_${month}`;
    if (this.realizadoMensal[key] == null) {
      this.realizadoMensal[key] = Number(localStorage.getItem(key) || 0);
    }
    return this.realizadoMensal[key];
  }

  setRealizadoMes(month: number, value: number) {
    if (!this.loSelecionadaId) return;
    const key = `planner_lo_realizado_${this.loSelecionadaId}_${month}`;
    this.realizadoMensal[key] = Math.max(0, Number(value || 0));
    localStorage.setItem(key, String(this.realizadoMensal[key]));
    if (this.token) {
      this.api.upsertLoRealizado(this.token, this.loSelecionadaId, month, this.realizadoMensal[key]).subscribe({ error: () => {} });
    }
  }

  totalRealizadoAnual(): number {
    return this.meses.reduce((acc, m) => acc + this.getRealizadoMes(this.monthIndex(m)), 0);
  }

  deltaMes(month: number): number {
    return this.getRealizadoMes(month) - this.totalComprometidoMesLo(month);
  }

  totalDeltaClm(): number {
    return this.totalRealizadoAnual() - this.totalComprometidoClm();
  }

  saldoLo(): number {
    return this.orcamentoLoSelecionada() - this.totalComprometidoClm();
  }

  saldoAtualLoSelecionada(): number {
    return this.orcamentoLoSelecionada() - this.totalPagoNaLoSelecionada();
  }

  totalTrimestre(trimestre: number): number {
    const start = trimestre * 3;
    return this.totalComprometidoMesLo(start) + this.totalComprometidoMesLo(start + 1) + this.totalComprometidoMesLo(start + 2);
  }

  currency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  number(value: any): number {
    return Number(value || 0);
  }

  horasDoCadastro(monthIndex: number): number {
    const mes = monthIndex + 1;
    const found = this.horasMes.find((h: any) => Number(h?.mes) === mes);
    const horas = Number(found?.horas ?? 160);
    return horas > 0 ? horas : 160;
  }

  
  private horasEfetivas(monthIndex: number, categoria?: 'FOLHA' | 'TERCEIRO', nomePessoa?: string, isDraft = false): number {
    if (categoria !== 'TERCEIRO') return isDraft ? this.horasDoCadastro(monthIndex) : 168;
    const base = this.horasDoCadastro(monthIndex);
    // Só desconta ausências quando a opção está ligada.
    if (!this.descontarAusencias || !nomePessoa) return base;
    const diasFora = this.diasAusenciaNoMes(nomePessoa, monthIndex, this.anoSelecionado);
    return Math.max(0, base - (diasFora * 8));
  }

  private diasAusenciaNoMes(nomePessoa: string, monthIndex: number, ano: number): number {
    const nomeNorm = this.normalized(nomePessoa || '');
    if (!nomeNorm) return 0;
    const pessoa = this.pessoas.find((p: any) => this.normalized(p?.nome || '') === nomeNorm);
    const pessoaId = String(pessoa?.id || '').trim();
    const monthStart = new Date(ano, monthIndex, 1);
    const monthEnd = new Date(ano, monthIndex + 1, 0);
    const dias = new Set<string>();

    for (const a of (this.ausencias || [])) {
      const aid = String(a?.pessoaId || '').trim();
      const anome = this.normalized(a?.pessoaNome || '');
      if (!(pessoaId && aid === pessoaId) && anome !== nomeNorm) continue;

      const inicioRaw = String(a?.inicio || '');
      const fimRaw = String(a?.fim || '');
      if (!inicioRaw || !fimRaw) continue;
      const inicio = new Date((a?.recorrente ? `${ano}-${inicioRaw.slice(5)}` : inicioRaw) + 'T00:00:00');
      const fim = new Date((a?.recorrente ? `${ano}-${fimRaw.slice(5)}` : fimRaw) + 'T00:00:00');
      if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) continue;

      const clampStart = inicio > monthStart ? inicio : monthStart;
      const clampEnd = fim < monthEnd ? fim : monthEnd;
      if (clampStart > clampEnd) continue;

      const cursor = new Date(clampStart.getTime());
      while (cursor <= clampEnd) {
        dias.add(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return dias.size;
  }

  horasDescontadasPorAusencia(allocationId: string, monthIndex: number): number {
    if (!this.descontarAusencias) return 0;
    const categoria = this.categoriaDaAlocacaoId(allocationId);
    if (categoria !== 'TERCEIRO') return 0;
    const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
    const diasFora = this.diasAusenciaNoMes(nomePessoa, monthIndex, this.anoSelecionado);
    if (diasFora <= 0) return 0;
    const base = this.horasDoCadastro(monthIndex);
    return Math.min(base, diasFora * 8);
  }

  temReducaoPorAusencia(allocationId: string, monthIndex: number): boolean {
    return this.horasDescontadasPorAusencia(allocationId, monthIndex) > 0;
  }

  private categoriaDaAlocacaoId(allocationId: string): 'FOLHA' | 'TERCEIRO' {
    const aloc = this.alocacoes.find((a: any) => a.id === allocationId);
    if (!aloc) return 'FOLHA';
    return this.getCategoriaDaPessoa(aloc);
  }

  private categoriaNovaAlocacao(): 'FOLHA' | 'TERCEIRO' {
    if (this.novaPessoaSelecionadaId) {
      const pessoa = this.pessoas.find((p: any) => p.id === this.novaPessoaSelecionadaId);
      if (pessoa) {
        return (pessoa.tipoVinculo || '').toUpperCase() === 'TERCEIRO' ? 'TERCEIRO' : 'FOLHA';
      }
    }
    const nome = this.normalized(this.form.nomePessoa || '');
    const pessoa = this.pessoas.find((p: any) => this.normalized(p?.nome || '') === nome);
    if (pessoa) {
      return (pessoa.tipoVinculo || '').toUpperCase() === 'TERCEIRO' ? 'TERCEIRO' : 'FOLHA';
    }
    return 'FOLHA';
  }

  horasMesAtual(): number {
    return this.horasDoCadastro(new Date().getMonth());
  }

  isPago(allocationId: string, month: number): boolean {
    const key = this.pagoKey(allocationId, month);
    return !!this.pagoMensal[key];
  }

  
  setPago(allocationId: string, month: number, checked: boolean) {
    if (checked) {
      const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
      if (this.outraLinhaComControleNoMes(nomePessoa, month, allocationId)) {
        this.percentualAviso = `${nomePessoa} já possui lançamento ou pagamento em outra linha em ${this.meses[month]}. Cancele o lançamento anterior para lançar nesta linha.`;
        return;
      }
    }
    const key = this.pagoKey(allocationId, month);
    const prev = !!this.pagoMensal[key];
    this.pagoMensal[key] = checked;
    if (!this.token) return;
    this.api.upsertAllocationPayment(this.token, allocationId, month, checked).subscribe({
      error: () => {
        this.pagoMensal[key] = prev;
        this.percentualAviso = 'Falha ao salvar pagamento no servidor.';
      }
    });
  }

  private pagoKey(allocationId: string, month: number): string {
    return `planner_lo_pago_${allocationId}_${month}`;
  }

  isCancelado(allocationId: string, month: number): boolean {
    const key = this.canceladoKey(allocationId, month);
    return !!this.canceladoMensal[key];
  }

  
  setCancelado(allocationId: string, month: number, checked: boolean) {
    const key = this.canceladoKey(allocationId, month);
    const prev = !!this.canceladoMensal[key];
    this.canceladoMensal[key] = checked;
    if (this.token) {
      this.api.upsertAllocationMonthlyState(this.token, allocationId, month, { canceled: checked }).subscribe({
        error: () => {
          this.canceladoMensal[key] = prev;
          this.percentualAviso = 'Falha ao salvar cancelamento no servidor.';
        }
      });
    }
    if (checked) {
      
      const pagoKey = this.pagoKey(allocationId, month);
      this.pagoMensal[pagoKey] = false;
      if (this.token) {
        this.api.upsertAllocationPayment(this.token, allocationId, month, false).subscribe();
      }
    }
  }

  private canceladoKey(allocationId: string, month: number): string {
    return `planner_lo_cancelado_${allocationId}_${month}`;
  }

  private startPaymentsRealtimeSync() {
    if (this.paymentsSyncTimer) {
      clearInterval(this.paymentsSyncTimer);
      this.paymentsSyncTimer = null;
    }
    if (!this.token) return;
    this.loadPagamentosDoBackend();
    this.paymentsSyncTimer = setInterval(() => this.loadPagamentosDoBackend(), 3000);
  }

  private startPresenceRealtimeSync() {
    if (this.presenceSyncTimer) {
      clearInterval(this.presenceSyncTimer);
      this.presenceSyncTimer = null;
    }
    if (!this.token) return;
    this.loadLoPresence();
    this.heartbeatLoAberta();
    this.presenceSyncTimer = setInterval(() => {
      this.heartbeatLoAberta();
      this.loadLoPresence();
    }, 3000);
  }

  private heartbeatLoAberta() {
    if (!this.token || !this.loSelecionadaId) return;
    this.api.upsertLoPresence(this.token, this.loSelecionadaId).subscribe({ error: () => {} });
  }

  private loadLoPresence() {
    if (!this.token) return;
    this.api.listLoPresence(this.token).subscribe({
      next: (rows: any[]) => {
        const loId = this.loSelecionadaId;
        const mine = (localStorage.getItem('planner_user') || '').trim().toLowerCase();
        const users = (rows || [])
          .filter((r: any) => String(r?.loId || '') === loId)
          .map((r: any) => String(r?.username || '').trim())
          .filter((u: string) => !!u);
        const unique = Array.from(new Set(users.map((u) => u.toLowerCase())))
          .map((uLower) => users.find((u) => u.toLowerCase() === uLower) || uLower);
        unique.sort((a, b) => (a.toLowerCase() === mine ? -1 : b.toLowerCase() === mine ? 1 : a.localeCompare(b)));
        this.usuariosLoAberta = unique.map((u) => ({ username: u }));
      }
    });
  }

  private startMonthlyStateRealtimeSync() {
    if (this.monthlyStateSyncTimer) {
      clearInterval(this.monthlyStateSyncTimer);
      this.monthlyStateSyncTimer = null;
    }
    if (!this.token) return;
    this.loadMonthlyStateFromBackend();
    this.monthlyStateSyncTimer = setInterval(() => this.loadMonthlyStateFromBackend(), 3000);
  }

  private startCursorRealtimeSync() {
    if (this.cursorSyncTimer) {
      clearInterval(this.cursorSyncTimer);
      this.cursorSyncTimer = null;
    }
    if (!this.token) return;
    this.loadAllocationCursors();
    this.cursorSyncTimer = setInterval(() => {
      this.pushCursor();
      this.loadAllocationCursors();
    }, 900);
  }

  private pushCursor() {
    if (!this.token || !this.loSelecionadaId || !this.latestCursorPos) return;
    const pos = this.latestCursorPos;
    this.lastCursorSendAt = Date.now();
    this.api.upsertAllocationCursor(this.token, { loId: this.loSelecionadaId, x: pos.x, y: pos.y }).subscribe({ error: () => {} });
  }

  private loadAllocationCursors() {
    if (!this.token || !this.loSelecionadaId) return;
    const mine = (localStorage.getItem('planner_user') || '').trim().toLowerCase();
    this.api.listAllocationCursors(this.token, this.loSelecionadaId).subscribe({
      next: (rows: any[]) => {
        this.cursoresOutros = (rows || [])
          .map((r: any) => ({
            username: String(r?.username || '').trim(),
            x: Number(r?.x),
            y: Number(r?.y)
          }))
          .filter((r: any) => !!r.username && r.username.toLowerCase() !== mine && !Number.isNaN(r.x) && !Number.isNaN(r.y));
        this.cdr.markForCheck();
      }
    });
  }

  private loadMonthlyStateFromBackend() {
    if (!this.token) return;
    this.api.listAllocationMonthlyState(this.token).subscribe({
      next: (rows: any[]) => {
        const nextCancelado: Record<string, boolean> = {};
        const nextValorManual: Record<string, number> = {};
        const nextPctManual: Record<string, number> = {};
        for (const r of rows || []) {
          const allocId = String(r?.allocationId || '').trim();
          const month = Number(r?.month);
          if (!allocId || month < 0 || month > 11) continue;
          const cKey = this.canceladoKey(allocId, month);
          const vKey = this.valorMensalManualKey(allocId, month);
          const pKey = this.percentualMensalManualKey(allocId, month);
          if (r?.canceled === true) nextCancelado[cKey] = true;
          if (r?.manualValue != null && r?.manualValue !== '') {
            const n = Number(r.manualValue);
            if (!Number.isNaN(n) && n >= 0) nextValorManual[vKey] = this.round2(n);
          }
          if (r?.manualPercent != null && r?.manualPercent !== '') {
            const p = Number(r.manualPercent);
            if (!Number.isNaN(p)) nextPctManual[pKey] = Math.max(0, Math.min(100, p));
          }
        }
        this.canceladoMensal = nextCancelado;
        this.valorMensalManual = nextValorManual;
        this.percentualMensalManual = nextPctManual;
        this.cdr.markForCheck();
      }
    });
  }

  userInitials(username: string): string {
    const clean = String(username || '').trim();
    if (!clean) return '?';
    const parts = clean.split(/[.\s_-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }

  isUsuarioAtual(username: string): boolean {
    const mine = (localStorage.getItem('planner_user') || '').trim().toLowerCase();
    return !!mine && String(username || '').trim().toLowerCase() === mine;
  }

  private loadPagamentosDoBackend() {
    if (!this.token) return;
    this.api.listAllocationPayments(this.token).subscribe({
      next: (rows: any[]) => {
        const nextState: Record<string, boolean> = {};
        for (const r of rows || []) {
          const allocId = String(r?.allocationId || '').trim();
          const month = Number(r?.month);
          if (!allocId || month < 0 || month > 11) continue;
          nextState[this.pagoKey(allocId, month)] = !!r?.paid;
        }
        this.pagoMensal = nextState;
        this.cdr.markForCheck();
      }
    });
  }

  private startAllocationPercentRealtimeSync() {
    if (this.allocationPercentSyncTimer) {
      clearInterval(this.allocationPercentSyncTimer);
      this.allocationPercentSyncTimer = null;
    }
    if (!this.token) return;
    this.loadAllocationPercentsFromBackend();
    this.allocationPercentSyncTimer = setInterval(() => this.loadAllocationPercentsFromBackend(), 5000);
  }

  private startLoRealizadoRealtimeSync() {
    if (this.loRealizadoSyncTimer) {
      clearInterval(this.loRealizadoSyncTimer);
      this.loRealizadoSyncTimer = null;
    }
    if (!this.token) return;
    this.loadLoRealizadoFromBackend();
    this.loRealizadoSyncTimer = setInterval(() => this.loadLoRealizadoFromBackend(), 5000);
  }

  private loadAllocationPercentsFromBackend() {
    if (!this.token) return;
    this.api.listAllocationPercent(this.token).subscribe({
      next: (rows: any[]) => {
        // Build set of allocIds that already exist in backend
        const backendAllocIds = new Set<string>();
        for (const r of rows || []) {
          const allocId = String(r?.allocationId || '').trim();
          if (!allocId) continue;
          backendAllocIds.add(allocId);
          const pct = Math.max(0, Math.min(100, Number(r?.percentual ?? 100)));
          this.planoAlocacao[allocId] = { percentual: pct };
          // Keep localStorage in sync for backward compat
          localStorage.setItem(`planner_lo_alloc_${allocId}`, JSON.stringify({ percentual: pct }));
        }
        // Migration: push localStorage values to backend for allocations not yet there
        if (this.token) {
          for (const a of this.alocacoes) {
            if (backendAllocIds.has(a.id)) continue;
            const saved = localStorage.getItem(`planner_lo_alloc_${a.id}`);
            if (saved == null) continue;
            try {
              const parsed = JSON.parse(saved);
              const pct = Math.max(0, Math.min(100, Number(parsed?.percentual ?? 100)));
              this.api.upsertAllocationPercent(this.token, a.id, pct).subscribe({ error: () => {} });
            } catch { /* ignore */ }
          }
        }
        this.cdr.markForCheck();
      }
    });
  }

  private loadLoRealizadoFromBackend() {
    if (!this.token) return;
    this.api.listLoRealizado(this.token).subscribe({
      next: (rows: any[]) => {
        // Build set of (loId_month) pairs already in backend
        const backendKeys = new Set<string>();
        for (const r of rows || []) {
          const loId = String(r?.loId || '').trim();
          const month = Number(r?.month);
          if (!loId || month < 0 || month > 11) continue;
          backendKeys.add(`${loId}_${month}`);
          const key = `planner_lo_realizado_${loId}_${month}`;
          const valor = Math.max(0, Number(r?.valor ?? 0));
          this.realizadoMensal[key] = valor;
          localStorage.setItem(key, String(valor));
        }
        this.cdr.markForCheck();
        // Migration: push localStorage values for all known LOs not yet in backend
        if (this.token) {
          for (const lo of this.linhasOrcamentarias) {
            const loId = String(lo?.id || '');
            if (!loId) continue;
            for (let month = 0; month < 12; month++) {
              if (backendKeys.has(`${loId}_${month}`)) continue;
              const key = `planner_lo_realizado_${loId}_${month}`;
              const val = localStorage.getItem(key);
              if (val == null) continue;
              const valor = Number(val || 0);
              if (valor > 0) {
                this.api.upsertLoRealizado(this.token, loId, month, valor).subscribe({ error: () => {} });
              }
            }
          }
        }
      }
    });
  }

  private outraLinhaComControleNoMes(nomePessoa: string, month: number, excludeAllocationId: string): boolean {
    return this.alocacoes
      .filter((a: any) => a.id !== excludeAllocationId)
      .filter((a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa))
      .some((a: any) => this.mesComControleExplicito(a.id, month));
  }

  getCategoriaDaPessoa(allocation: any): 'FOLHA' | 'TERCEIRO' {
    const rawDireto = String(
      allocation?.tipoVinculo ??
      allocation?.categoria ??
      allocation?.pessoaTipoVinculo ??
      allocation?.pessoaCategoria ??
      ''
    ).toUpperCase();
    if (rawDireto.includes('TERCEIRO') || rawDireto.includes('PRESTADOR')) return 'TERCEIRO';
    if (rawDireto.includes('FOLHA')) return 'FOLHA';

    const nome = this.normalized(allocation?.nomePessoa || '');
    const pessoa = this.pessoas.find((p: any) => this.normalized(p?.nome || '') === nome);
    const tipoPessoa = String(pessoa?.tipoVinculo || '').toUpperCase();
    return tipoPessoa === 'TERCEIRO' ? 'TERCEIRO' : 'FOLHA';
  }

  private nomePessoaDaAlocacao(allocationId: string): string {
    const found = this.alocacoes.find((a: any) => a.id === allocationId);
    return found?.nomePessoa || 'Pessoa';
  }

  private normalized(value: string): string {
    return (value || '').trim().toLowerCase();
  }

  startEdit(a: any) {
    this.editingId = a.id;
    this.form = {
      linhaOrcamentariaId: a.linhaOrcamentariaId,
      nomePessoa: a.nomePessoa,
      perfilId: a.perfilId,
      horasPlanejadas: Number(a.horasPlanejadas),
      valorHora: a?.valorHora != null ? Number(a.valorHora) : null
    };
    this.draftValorHoraMasked = this.form.valorHora != null ? this.formatCurrency(this.form.valorHora) : '';
    const pessoa = this.pessoas.find((p: any) => this.normalized(p?.nome || '') === this.normalized(a?.nomePessoa || ''));
    this.pessoaEdicaoSelecionadaId = pessoa?.id || '';
    this.pessoaEdicaoNome = a.nomePessoa || '';
  }

  selectLoTab(loId: string) {
    this.loSelecionadaId = loId;
    if (!this.editingId) {
      this.form.linhaOrcamentariaId = loId;
    }
    if (!this.ordemPorLo[loId]) {
      this.ordemPorLo[loId] = this.carregarOrdemLo(loId);
    }
    this.heartbeatLoAberta();
    this.loadLoPresence();
    this.loadAllocationCursors();
    this.scrollToCurrentMonth();
  }

  cursorLeft(c: { x: number; y: number }): string { return `${Math.max(0, Math.min(100, c.x * 100))}vw`; }
  cursorTop(c: { x: number; y: number }): string { return `${Math.max(0, Math.min(100, c.y * 100))}vh`; }

  saveEdit() {
    if (!this.editingId) return;
    const atual = this.alocacoes.find((a: any) => a.id === this.editingId);
    if (!this.normalized(this.form.nomePessoa)) {
      this.percentualAviso = 'Informe o nome da pessoa.';
      return;
    }
    if (!this.form.perfilId) {
      this.percentualAviso = 'Informe o perfil da pessoa.';
      return;
    }
    // Mantém a alocação como rascunho se ela já era ou se a LO está em rascunho,
    // pois uma LO em rascunho só aceita alocações do tipo rascunho.
    const payload: any = { id: this.editingId, ...this.form, horasPlanejadas: this.horasMesAtual() };
    if (!!atual?.draft || this.loSelecionadaEhDraft()) payload.draft = true;
    this.update.emit(payload);
    this.editingId = '';
    this.pessoaEdicaoSelecionadaId = '';
    this.pessoaEdicaoNome = '';
  }

  cancelEdit() {
    this.editingId = '';
    this.pessoaEdicaoSelecionadaId = '';
    this.pessoaEdicaoNome = '';
  }

  selecionarPessoaNova(pessoaId: string) {
    this.novaPessoaSelecionadaId = pessoaId;
    if (!pessoaId) {
      this.form.nomePessoa = '';
      this.form.perfilId = '';
      this.pessoaNovaNome = '';
      return;
    }
    // Pessoa real selecionada => alocação real (desliga o rascunho auto-ativado ao digitar).
    if (!this.loSelecionadaEhDraft()) this.draftMode = false;
    this.preencherPessoaNoForm(pessoaId);
  }

  selecionarPessoaEdicao(pessoaId: string) {
    this.pessoaEdicaoSelecionadaId = pessoaId;
    if (!pessoaId) {
      this.form.nomePessoa = '';
      this.form.perfilId = '';
      this.pessoaEdicaoNome = '';
      return;
    }
    this.preencherPessoaNoForm(pessoaId);
  }

  abrirPessoaModal() {
    this.pessoaModalAberto = true;
    this.pessoaRapida = { nome: '', perfilId: '', tipoVinculo: 'BV', consultoria: '', valorHora: null, valorMensal: null, vagaUrl: '' };
    this.pessoaValorHoraMasked = '';
    this.pessoaValorMensalMasked = '';
  }

  fecharPessoaModal() {
    this.pessoaModalAberto = false;
  }

  salvarPessoaRapida() {
    this.createPerson.emit(this.pessoaRapida);
    this.fecharPessoaModal();
  }

  isDonoDaLoAtual(): boolean {
    const lo = this.loSelecionada();
    if (!lo) return false;
    const me = (localStorage.getItem('planner_user') || '').trim().toLowerCase();
    const role = (localStorage.getItem('planner_role') || '').trim();
    if (role === 'ADMIN') return true;
    const dono = (lo.dono || '').trim().toLowerCase();
    return !dono || dono === me;
  }

  abrirDonoModal() {
    this.donoNovoInput = '';
    this.donoModalAberto = true;
  }

  fecharDonoModal() {
    this.donoModalAberto = false;
    this.donoNovoInput = '';
  }

  salvarTransferenciaDono() {
    const lo = this.loSelecionada();
    if (!lo || !this.donoNovoInput.trim() || !this.token) return;
    this.api.transferBudgetLineDono(this.token, lo.id, this.donoNovoInput.trim()).subscribe({
      next: (updated: any) => {
        // atualiza a LO localmente sem recarregar a página
        const idx = this.linhasOrcamentarias.findIndex((l: any) => l.id === updated.id);
        if (idx >= 0) this.linhasOrcamentarias[idx] = updated;
        this.fecharDonoModal();
      },
      error: (err: any) => {
        alert(err?.error?.message || 'Erro ao transferir dono da LO.');
      }
    });
  }

  onPessoaValorHoraChange(value: string) {
    const digits = (value ?? '').replace(/\D/g, '');
    const cents = digits ? Number.parseInt(digits, 10) : 0;
    this.pessoaRapida.valorHora = cents / 100;
    this.pessoaValorHoraMasked = this.formatCurrency(this.pessoaRapida.valorHora);
  }

  onPessoaValorMensalChange(value: string) {
    const digits = (value ?? '').replace(/\D/g, '');
    const cents = digits ? Number.parseInt(digits, 10) : 0;
    this.pessoaRapida.valorMensal = cents / 100;
    this.pessoaValorMensalMasked = this.formatCurrency(this.pessoaRapida.valorMensal);
  }

  // ── Valor/hora editável das alocações rascunho ─────────────────────────────
  onDraftValorHoraChange(value: string) {
    const digits = (value ?? '').replace(/\D/g, '');
    const cents = digits ? Number.parseInt(digits, 10) : 0;
    this.form.valorHora = cents / 100;
    this.draftValorHoraMasked = this.formatCurrency(this.form.valorHora);
  }

  /** Ao escolher o perfil de um rascunho, pré-preenche o valor/hora com o do perfil (editável). */
  onDraftPerfilChange() {
    const perfil = this.perfis.find((x: any) => x.id === this.form.perfilId);
    const vh = perfil ? Number(perfil.valorHora || 0) : 0;
    this.form.valorHora = vh;
    this.draftValorHoraMasked = this.formatCurrency(vh);
  }

  adicionarAlocacao() {
    const nomePessoa = this.form.nomePessoa || '';
    // Uma LO em rascunho só aceita alocações do tipo rascunho, então tratamos
    // a alocação como draft mesmo sem o toggle manual estar ligado.
    const ehDraft = this.draftMode || this.loSelecionadaEhDraft();

    if (!this.normalized(nomePessoa)) {
      this.percentualAviso = ehDraft ? 'Informe o nome da pessoa rascunho.' : 'Selecione uma pessoa.';
      return;
    }
    if (!this.form.perfilId) {
      this.percentualAviso = 'Informe o perfil da pessoa.';
      return;
    }

    if (!ehDraft) {
      if (this.normalized(nomePessoa) && this.profissionalSemDisponibilidadeNoAno(nomePessoa)) {
        this.percentualAviso = `${nomePessoa} já está com 100% de alocação em todos os meses e não pode receber nova linha de alocação.`;
        return;
      }
      if (this.normalized(nomePessoa)) {
        const maxDisponivel = this.percentualMaximoNovaAlocacao(nomePessoa);
        if (maxDisponivel <= 0) {
          this.percentualAviso = `${nomePessoa} não possui percentual disponível para nova alocação neste ano.`;
          return;
        }
        if (this.novaAlocacaoPercentual > maxDisponivel) {
          this.novaAlocacaoPercentual = maxDisponivel;
          this.percentualAviso = `Percentual ajustado para ${maxDisponivel.toFixed(2)}% (limite disponivel nos meses abertos).`;
        }
      }
    }

    if (this.normalized(nomePessoa) && this.loSelecionadaId && !ehDraft) {
      const pendingKey = this.pendingPctKey(nomePessoa, this.loSelecionadaId);
      localStorage.setItem(pendingKey, String(this.novaAlocacaoPercentual));
    }

    const payload: any = { ...this.form, horasPlanejadas: this.horasMesAtual() };
    if (ehDraft) payload.draft = true;
    if (this.novoMesInicio > 0) payload.mesInicio = this.novoMesInicio;

    this.create.emit(payload);
    this.form.nomePessoa = '';
    this.form.perfilId = '';
    this.novaPessoaSelecionadaId = '';
    this.pessoaNovaNome = '';
    this.novaAlocacaoPercentual = 100;
    this.novaPctMasked = this.formatPct(100);
    this.novaLinhaAberta = false;
    this.draftMode = false;
    this.novoMesInicio = 0;
  }

  abrirNovaLinha() {
    this.novaLinhaAberta = true;
    this.editingId = '';
    // default sempre desativado; o usuário decide ativar manualmente
    this.draftMode = false;
    this.form.valorHora = null;
    this.draftValorHoraMasked = '';
  }

  fecharNovaLinha() {
    this.novaLinhaAberta = false;
    this.novaPessoaSelecionadaId = '';
    this.pessoaNovaNome = '';
    this.form.nomePessoa = '';
    this.form.perfilId = '';
    this.form.valorHora = null;
    this.draftValorHoraMasked = '';
    this.novaAlocacaoPercentual = 100;
    this.novaPctMasked = this.formatPct(100);
    this.draftMode = false;
    this.novoMesInicio = 0;
  }

  loSelecionadaEhDraft(): boolean {
    return this.loSelecionada()?.situacao === 'DRAFT';
  }

  isDraft(a: any): boolean { return !!a.draft; }

  isPessoaPlaneada(a: any): boolean {
    return typeof a.nomePessoa === 'string' && a.nomePessoa.startsWith('Pessoa Planejada ');
  }

  temPessoasPlanejadas(): boolean {
    return this.alocacoesFiltradas().some((a: any) => this.isPessoaPlaneada(a));
  }

  countPlanejaDasContando(): number {
    return this.alocacoesFiltradas()
      .filter((a: any) => this.isPessoaPlaneada(a) &&
        (this.incluirRascunhoNosTotalizadores || this.isPlanejadaAtivaNosTotal(a.id)))
      .length;
  }

  isPlanejadaAtivaNosTotal(allocationId: string): boolean {
    return !!this.incluirPlanejadaNosTotal[allocationId];
  }

  togglePlanejadaNosTotal(allocationId: string) {
    this.incluirPlanejadaNosTotal[allocationId] = !this.incluirPlanejadaNosTotal[allocationId];
    this.percentualAviso = '';
  }

  getMesInicioLabel(mesInicio: number | undefined | null): string {
    if (!mesInicio || mesInicio <= 0) return '';
    return `Início: ${this.meses[mesInicio]}`;
  }

  perfilNomePessoaSelecionadaNova(): string {
    const pessoa = this.pessoas.find((p: any) => p.id === this.novaPessoaSelecionadaId);
    if (!pessoa?.perfilId) return '-';
    const perfil = this.perfis.find((x: any) => x.id === pessoa.perfilId);
    return this.perfilSemDepartamento(perfil?.nomePerfil || '-');
  }

  perfilNomePessoaSelecionadaEdicao(): string {
    const pessoa = this.pessoas.find((p: any) => p.id === this.pessoaEdicaoSelecionadaId);
    if (!pessoa?.perfilId) return '-';
    const perfil = this.perfis.find((x: any) => x.id === pessoa.perfilId);
    return this.perfilSemDepartamento(perfil?.nomePerfil || '-');
  }

  perfilSemDepartamento(nomePerfil: string): string {
    const raw = String(nomePerfil || '').trim();
    if (!raw || raw === '-') return '-';
    const [main, obs] = raw.split(' - ', 2);
    const partes = String(main || '').split(' | ').map((p) => p.trim()).filter(Boolean);
    const base = partes.length >= 2 ? `${partes[0]} | ${partes[1]}` : (partes[0] || raw);
    return obs ? `${base} - ${obs}` : base;
  }

  /** Rótulo do perfil para os selects, exibindo o valor/hora ao lado do nome. */
  perfilOptionLabel(p: any): string {
    const nome = this.perfilSemDepartamento(p?.nomePerfil || '-');
    if (p?.debitaLo === false) return `${nome} — não debita LO`;
    const vh = Number(p?.valorHora || 0);
    return vh ? `${nome} — ${this.currency(vh)}/h` : nome;
  }

  categoriaPessoaSelecionadaNova(): string {
    const pessoa = this.pessoas.find((p: any) => p.id === this.novaPessoaSelecionadaId);
    if (!pessoa) return '-';
    return String(pessoa?.tipoVinculo || '').toUpperCase() === 'TERCEIRO' ? 'Prestador de servico' : 'Folha';
  }

  isTerceiroNovaPessoa(): boolean {
    const pessoa = this.pessoas.find((p: any) => p.id === this.novaPessoaSelecionadaId);
    return String(pessoa?.tipoVinculo || '').toUpperCase() === 'TERCEIRO';
  }

  isTerceiroEdicaoPessoa(): boolean {
    const pessoa = this.pessoas.find((p: any) => p.id === this.pessoaEdicaoSelecionadaId);
    return String(pessoa?.tipoVinculo || '').toUpperCase() === 'TERCEIRO';
  }

  vagaUrlDaPessoa(nomePessoa: string): string | null {
    const p = this.pessoas.find((x: any) => this.normalized(x?.nome || '') === this.normalized(nomePessoa || ''));
    return p?.vagaUrl || null;
  }

  vagaAliasDaPessoa(nomePessoa: string): string {
    const p = this.pessoas.find((x: any) => this.normalized(x?.nome || '') === this.normalized(nomePessoa || ''));
    return p?.vagaAlias || 'Abrir vaga →';
  }

  vagaUrlDaPessoaId(pessoaId: string): string | null {
    const p = this.pessoas.find((x: any) => x.id === pessoaId);
    return p?.vagaUrl || null;
  }

  vagaAliasDaPessoaId(pessoaId: string): string {
    const p = this.pessoas.find((x: any) => x.id === pessoaId);
    return p?.vagaAlias || 'Abrir vaga →';
  }

  copyText(value: string) {
    const text = String(value || '').trim();
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
  }
  categoriaPessoaSelecionadaEdicao(): string {
    const pessoa = this.pessoas.find((p: any) => p.id === this.pessoaEdicaoSelecionadaId);
    return String(pessoa?.tipoVinculo || '').toUpperCase() === 'TERCEIRO' ? 'Prestador de servico' : 'Folha';
  }

  teamsUrlPrestador(nomePessoa: string): string | null {
    const pessoa = this.pessoas.find((p: any) => this.normalized(p?.nome || '') === this.normalized(nomePessoa || ''));
    const nomeConsultoria = String(pessoa?.consultoria || '').trim();
    if (!nomeConsultoria) return null;
    const consultoria = this.consultorias.find((c: any) => this.normalized(c?.nome || '') === this.normalized(nomeConsultoria));
    const email = String(consultoria?.email || '').trim();
    if (!email || !email.includes('@')) return null;
    return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`;
  }

  valorHoraPessoaSelecionadaNova(): number {
    // Rascunho com valor/hora informado manualmente na linha.
    if ((this.draftMode || this.loSelecionadaEhDraft()) && this.form?.valorHora != null) return Number(this.form.valorHora);
    const pessoa = this.pessoas.find((p: any) => p.id === this.novaPessoaSelecionadaId);
    if (pessoa?.valorHora != null) return Number(pessoa.valorHora);
    if (pessoa?.perfilId) {
      const perfil = this.perfis.find((x: any) => x.id === pessoa.perfilId);
      if (perfil?.valorHora != null) return Number(perfil.valorHora);
    }
    if (this.form?.perfilId) {
      const perfilSelecionado = this.perfis.find((x: any) => x.id === this.form.perfilId);
      if (perfilSelecionado?.valorHora != null) return Number(perfilSelecionado.valorHora);
    }
    return 0;
  }

  valorHoraPessoaSelecionadaEdicao(): number {
    // Rascunho com valor/hora informado manualmente na linha.
    const atual = this.alocacoes.find((a: any) => a.id === this.editingId);
    if ((!!atual?.draft || this.loSelecionadaEhDraft()) && this.form?.valorHora != null) return Number(this.form.valorHora);
    const pessoa = this.pessoas.find((p: any) => p.id === this.pessoaEdicaoSelecionadaId);
    if (pessoa?.valorHora != null) return Number(pessoa.valorHora);
    if (pessoa?.perfilId) {
      const perfil = this.perfis.find((x: any) => x.id === pessoa.perfilId);
      if (perfil?.valorHora != null) return Number(perfil.valorHora);
    }
    // Alocações rascunho não têm pessoa real: o valor/hora vem do perfil escolhido.
    if (this.form?.perfilId) {
      const perfilSelecionado = this.perfis.find((x: any) => x.id === this.form.perfilId);
      if (perfilSelecionado?.debitaLo === false) return 0;
      if (perfilSelecionado?.valorHora != null) return Number(perfilSelecionado.valorHora);
    }
    return 0;
  }

  custoMensalNovaPessoa(monthIndex: number): number {
    if (this.mesIndisponivelNovaPessoa(monthIndex)) return 0;
    const valorHora = this.valorHoraPessoaSelecionadaNova();
    const percentual = Number(this.novaAlocacaoPercentual || 0) / 100;
    const horas = this.horasEfetivas(monthIndex, this.categoriaNovaAlocacao(), this.form.nomePessoa || '', this.draftMode);
    return valorHora * horas * percentual;
  }

  custoAnualNovaPessoa(): number {
    return this.meses.reduce((sum: number, _m: string, monthIndex: number) => sum + this.custoMensalNovaPessoaDisponivel(monthIndex), 0);
  }

  mesIndisponivelNovaPessoa(month: number): boolean {
    const nomePessoa = this.form.nomePessoa || '';
    if (!this.normalized(nomePessoa)) return false;
    return this.disponibilidadeMes(nomePessoa, month).indisponivel;
  }

  motivoMesIndisponivelNovaPessoa(month: number): string {
    const nomePessoa = this.form.nomePessoa || '';
    if (!this.normalized(nomePessoa)) return '';
    const loId = this.loIdBloqueanteMesNovaPessoa(month);
    if (loId && loId === this.loSelecionadaId) return 'Já alocado nessa LO';
    return this.disponibilidadeMes(nomePessoa, month).motivo;
  }

  
  percentualDisponivelNovaPessoa(month: number): number {
    const nomePessoa = this.form.nomePessoa || '';
    if (!this.normalized(nomePessoa)) return 100;
    return this.percentualDisponivelNoMes(nomePessoa, month);
  }

  
  mesParcialmenteDisponivelNovaPessoa(month: number): boolean {
    if (this.mesIndisponivelNovaPessoa(month)) return false;
    const disponivel = this.percentualDisponivelNovaPessoa(month);
    return disponivel < Number(this.novaAlocacaoPercentual || 100);
  }

  
  custoMensalNovaPessoaDisponivel(month: number): number {
    if (this.mesIndisponivelNovaPessoa(month)) return 0;
    const disponivel = this.percentualDisponivelNovaPessoa(month);
    const pctEfetivo = Math.min(Number(this.novaAlocacaoPercentual || 0), disponivel);
    const valorHora = this.valorHoraPessoaSelecionadaNova();
    const horas = this.horasEfetivas(month, this.categoriaNovaAlocacao(), this.form.nomePessoa || '', this.draftMode);
    return this.round2(valorHora * horas * pctEfetivo / 100);
  }

  custoMensalEdicaoPessoa(allocationId: string, monthIndex: number): number {
    if (this.isCancelado(allocationId, monthIndex)) return 0;
    if (this.mesIndisponivelParaAlocacao(allocationId, monthIndex)) return 0;
    const valorHora = this.valorHoraPessoaSelecionadaEdicao();
    const percentual = Number(this.getConfig(allocationId).percentual || 0) / 100;
    const isDraftAloc = !!(this.alocacoes.find((a: any) => a.id === allocationId)?.draft);
    const horas = this.horasEfetivas(monthIndex, this.categoriaDaAlocacaoId(allocationId), this.nomePessoaDaAlocacao(allocationId), isDraftAloc);
    return valorHora * horas * percentual;
  }

  custoAnualEdicaoPessoa(allocationId: string): number {
    return this.meses.reduce((sum: number, _m: string, monthIndex: number) => sum + this.custoMensalEdicaoPessoa(allocationId, monthIndex), 0);
  }

  onPessoaNovaNomeChange(nome: string) {
    this.pessoaNovaNome = nome;
    const pessoa = this.pessoas.find(
      (p: any) => this.normalized(p?.nome || '') === this.normalized(nome)
    );
    if (pessoa) {
      this.selecionarPessoaNova(pessoa.id);
      return;
    }

    this.novaPessoaSelecionadaId = '';
    // Nome fora do cadastro é mantido como pessoa fictícia (rascunho).
    this.form.nomePessoa = nome;
    if (this.normalized(nome) && !this.draftMode && !this.loSelecionadaEhDraft()) {
      // ativa o modo rascunho para liberar o seletor de perfil da pessoa fictícia
      this.draftMode = true;
    }
  }

  onPessoaEdicaoNomeChange(nome: string) {
    this.pessoaEdicaoNome = nome;
    const pessoa = this.pessoas.find(
      (p: any) => this.normalized(p?.nome || '') === this.normalized(nome)
    );
    if (pessoa) {
      this.selecionarPessoaEdicao(pessoa.id);
      return;
    }

    this.pessoaEdicaoSelecionadaId = '';
    if (this.editandoAlocacaoDraft()) {
      this.form.nomePessoa = nome;
    } else {
      this.form.nomePessoa = '';
      this.form.perfilId = '';
    }
  }

  private editandoAlocacaoDraft(): boolean {
    const alocacao = this.alocacoes.find((a: any) => a.id === this.editingId);
    return !!alocacao?.draft || this.loSelecionadaEhDraft();
  }

  numAlocacoesNaLoSelecionada(): number {
    return this.alocacoesFiltradas().filter((a: any) => this.alocacaoContaNoResumoLo(a)).length;
  }

  percentualUtilizadoLo(): number {
    const orc = this.orcamentoLoSelecionada();
    if (!orc) return 0;
    return (this.totalComprometidoClm() / orc) * 100;
  }

  totalPagoNaLoSelecionada(): number {
    return this.alocacoesFiltradas()
      .filter((a: any) => this.alocacaoContaNoResumoLo(a))
      .reduce((acc: number, a: any) => {
      const vh = this.getValorHoraDaAlocacao(a);
      return acc + this.meses.reduce((sum: number, _: string, mi: number) => {
        if (!this.isPago(a.id, mi)) return sum;
        return sum + this.round2(this.custoMensal(a.id, vh, mi));
      }, 0);
      }, 0);
  }

  totalPagoNaLoSelecionadaPorCategoria(categoria: 'FOLHA' | 'TERCEIRO'): number {
    return this.alocacoesFiltradas()
      .filter((a: any) => this.alocacaoContaNoResumoLo(a))
      .filter((a: any) => this.getCategoriaDaPessoa(a) === categoria)
      .reduce((acc: number, a: any) => {
        const vh = this.getValorHoraDaAlocacao(a);
        return acc + this.meses.reduce((sum: number, _: string, mi: number) => {
          if (!this.isPago(a.id, mi)) return sum;
          return sum + this.round2(this.custoMensal(a.id, vh, mi));
        }, 0);
      }, 0);
  }

  private alocacaoContaNoResumoLo(a: any): boolean {
    if (this.isPessoaPlaneada(a)) return this.incluirRascunhoNosTotalizadores || this.isPlanejadaAtivaNosTotal(a.id);
    if (a?.draft) return this.incluirRascunhoNosTotalizadores;
    return true;
  }

  onToggleIncluirRascunhoNosTotalizadores() {
    this.percentualAviso = '';
  }

  // ── Desconto de ausências (tela + extração) ────────────────────────────────
  private carregarDescontarAusencias(): boolean {
    try {
      const v = localStorage.getItem('planner_lo_descontar_ausencias');
      return v == null ? true : v === 'true';
    } catch { return true; }
  }

  salvarDescontarAusencias() {
    try { localStorage.setItem('planner_lo_descontar_ausencias', String(this.descontarAusencias)); } catch {}
    // Limpa o cache de valores exibidos para a tabela recalcular com/sem o desconto.
    this.valorMensalMaskedMap = {};
  }

  // ── Filtros da tabela (perfil / categoria) ─────────────────────────────────
  /** Perfis distintos presentes na LO atual (independente dos filtros ativos). */
  perfisDisponiveisNaLo(): string[] {
    const idsAno = new Set(this.linhasDoAnoSelecionado().map((lo: any) => lo.id));
    const set = new Set<string>();
    for (const a of this.alocacoes) {
      if (!idsAno.has(a.linhaOrcamentariaId)) continue;
      if (this.loSelecionadaId && a.linhaOrcamentariaId !== this.loSelecionadaId) continue;
      const p = String(a?.perfilNome || '').trim();
      if (p) set.add(p);
    }
    return [...set].sort((x, y) => x.localeCompare(y, 'pt-BR'));
  }

  temFiltrosTabela(): boolean { return !!this.filtroPerfil || !!this.filtroCategoria; }
  limparFiltrosTabela(): void { this.filtroPerfil = ''; this.filtroCategoria = ''; }

  /** Linhas exibidas na tabela: ordem da tela + filtros de perfil/categoria. */
  alocacoesVisiveis(): any[] {
    let list = this.alocacoesFiltradas();
    if (this.filtroCategoria) list = list.filter((a: any) => this.getCategoriaDaPessoa(a) === this.filtroCategoria);
    if (this.filtroPerfil) list = list.filter((a: any) => String(a?.perfilNome || '').trim() === this.filtroPerfil);
    return list;
  }

  // ── Anotações por pessoa/alocação ──────────────────────────────────────────
  private carregarAnotacoes(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem('planner_lo_anotacoes') || '{}') || {}; } catch { return {}; }
  }
  private persistAnotacoes(): void {
    try { localStorage.setItem('planner_lo_anotacoes', JSON.stringify(this.anotacoes)); } catch {}
  }
  getAnotacao(allocationId: string): string { return this.anotacoes[allocationId] || ''; }
  temAnotacao(allocationId: string): boolean { return !!this.getAnotacao(allocationId); }
  abrirAnotacao(allocationId: string): void {
    this.anotacaoEditId = allocationId;
    this.anotacaoEditValue = this.getAnotacao(allocationId);
  }
  cancelarAnotacao(): void { this.anotacaoEditId = null; this.anotacaoEditValue = ''; }
  salvarAnotacao(allocationId: string): void {
    const t = (this.anotacaoEditValue || '').trim();
    if (t) this.anotacoes[allocationId] = t; else delete this.anotacoes[allocationId];
    this.persistAnotacoes();
    if (this.token) this.api.upsertAllocationNote(this.token, allocationId, t).subscribe({ error: () => {} });
    this.anotacaoEditId = null;
    this.anotacaoEditValue = '';
  }
  removerAnotacao(allocationId: string): void {
    delete this.anotacoes[allocationId];
    this.persistAnotacoes();
    if (this.token) this.api.upsertAllocationNote(this.token, allocationId, '').subscribe({ error: () => {} });
    this.anotacaoEditId = null;
    this.anotacaoEditValue = '';
  }

  private loadAnotacoesFromBackend(): void {
    if (!this.token) return;
    this.api.listAllocationNotes(this.token).subscribe({
      next: (rows: any[]) => {
        const map: Record<string, string> = {};
        for (const r of rows || []) {
          const id = String(r?.allocationId || '').trim();
          const nota = String(r?.nota || '').trim();
          if (id && nota) map[id] = nota;
        }
        this.anotacoes = map;
        try { localStorage.setItem('planner_lo_anotacoes', JSON.stringify(map)); } catch {}
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  private preencherPessoaNoForm(pessoaId: string) {
    const pessoa = this.pessoas.find((p: any) => p.id === pessoaId);
    if (!pessoa) return;
    this.form.nomePessoa = pessoa.nome || '';
    this.form.valorHora = null;
    this.draftValorHoraMasked = '';
    if (pessoa.perfilId) {
      this.form.perfilId = pessoa.perfilId;
    }
  }

  private formatCurrency(value: number | null): string {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private formatCurrencyMasked(value: number | null): string {
    return Number(value || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private valorMensalMaskKey(allocationId: string, month: number): string {
    return `${allocationId}_${month}`;
  }

  getValorMensalMasked(allocationId: string, month: number, valorHora: number): string {
    const key = this.valorMensalMaskKey(allocationId, month);
    const masked = this.valorMensalMaskedMap[key];
    if (masked != null) return masked;
    return this.formatCurrencyMasked(this.getValorMensalDigitavel(allocationId, month, valorHora));
  }

  onValorMensalMaskedChange(value: string, allocationId: string, month: number) {
    const digits = String(value ?? '').replace(/\D/g, '');
    const cents = digits ? Number.parseInt(digits, 10) : 0;
    const amount = cents / 100;
    const key = this.valorMensalMaskKey(allocationId, month);
    this.valorMensalMaskedMap[key] = this.formatCurrencyMasked(amount);
    this.setValorMensalDigitavel(allocationId, month, amount);
  }

  syncValorMensalMasked(allocationId: string, month: number, valorHora: number) {
    const key = this.valorMensalMaskKey(allocationId, month);
    this.valorMensalMaskedMap[key] = this.formatCurrencyMasked(
      this.getValorMensalDigitavel(allocationId, month, valorHora)
    );
  }

  getValorMensalManual(allocationId: string, month: number): number | null {
    const key = this.valorMensalManualKey(allocationId, month);
    return this.valorMensalManual[key] ?? null;
  }

  getValorMensalDigitavel(allocationId: string, month: number, valorHora: number): number {
    const calculado = this.round2(this.custoMensalCalculado(allocationId, valorHora, month));
    const manual = this.getValorMensalManual(allocationId, month);
    if (manual != null) {
      // Quando houver abatimento por ausência/férias (TERCEIRO), nunca permitir exibir valor acima do calculado.
      if (this.temReducaoPorAusencia(allocationId, month)) return Math.min(manual, calculado);
      return manual;
    }
    return calculado;
  }

  setValorMensalDigitavel(allocationId: string, month: number, rawValue: number) {
    let valor = this.round2(Math.max(0, Number(rawValue || 0)));
    
    
    if (valor > 0) {
      const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
      const percentualOutras = this.percentualAtivoOutrasAlocacoesNoMes(nomePessoa, month, allocationId);
      const percentualRestante = Math.max(0, 100 - percentualOutras);
      const aloc = this.alocacoes.find((a: any) => a.id === allocationId);
      const horas = this.horasEfetivas(month, this.categoriaDaAlocacaoId(allocationId), this.nomePessoaDaAlocacao(allocationId), !!aloc?.draft);
      const valorHoraEfetivo = aloc ? this.getValorHoraDaAlocacao(aloc) : 0;
      const valorMaximoPermitido = this.round2((Number(valorHoraEfetivo || 0) * horas) * (percentualRestante / 100));
      if (valorMaximoPermitido > 0 && valor > valorMaximoPermitido) {
        valor = valorMaximoPermitido;
        this.percentualAviso = `Valor ajustado ao limite disponível de ${percentualRestante.toFixed(2)}% em ${this.meses[month]}.`;
      }
    }
    const key = this.valorMensalManualKey(allocationId, month);
    const prev = this.valorMensalManual[key];
    this.valorMensalManual[key] = valor;
    if (this.token) {
      this.api.upsertAllocationMonthlyState(this.token, allocationId, month, { manualValue: valor }).subscribe({
        error: () => {
          if (prev == null) delete this.valorMensalManual[key];
          else this.valorMensalManual[key] = prev;
          this.percentualAviso = 'Falha ao salvar valor manual no servidor.';
        }
      });
    }
  }

  limparValorMensalManual(allocationId: string, month: number, valorHora: number) {
    const key = this.valorMensalManualKey(allocationId, month);
    delete this.valorMensalManual[key];
    delete this.valorMensalMaskedMap[this.valorMensalMaskKey(allocationId, month)];
    if (this.token) {
      this.api.upsertAllocationMonthlyState(this.token, allocationId, month, { manualValue: null }).subscribe();
    }
    this.setValorMensalDigitavel(allocationId, month, this.custoMensalCalculado(allocationId, valorHora, month));
  }

  
  reabrirMes(allocationId: string, month: number) {
    const key = this.pagoKey(allocationId, month);
    this.pagoMensal[key] = false;
    if (this.token) {
      this.api.upsertAllocationPayment(this.token, allocationId, month, false).subscribe();
    }
  }

  private custoMensalCalculado(allocationId: string, valorHora: number, month: number): number {
    if (this.isCancelado(allocationId, month)) return 0;
    const percentual = this.getPercentualEfetivoMes(allocationId, month);
    const isDraftAloc = !!(this.alocacoes.find((a: any) => a.id === allocationId)?.draft);
    const horas = this.horasEfetivas(month, this.categoriaDaAlocacaoId(allocationId), this.nomePessoaDaAlocacao(allocationId), isDraftAloc);
    return (valorHora || 0) * horas * (percentual / 100);
  }

  private valorMensalManualKey(allocationId: string, month: number): string {
    return `planner_lo_valor_manual_${allocationId}_${month}`;
  }

  getPercentualMensalDigitavel(allocationId: string, month: number): number {
    const manual = this.getPercentualMensalManual(allocationId, month);
    if (manual != null) return manual;
    return Number(this.getConfig(allocationId).percentual || 0);
  }

  setPercentualMensalDigitavel(allocationId: string, month: number, rawValue: number) {
    const raw = Number(rawValue || 0);
    const valor = raw > 0 ? Math.max(0.01, Math.min(100, raw)) : 0;
    const maxPermitido = this.percentualDisponivelParaLinha(allocationId, month);
    const valorAjustado = Math.min(valor, maxPermitido);
    const base = Number(this.getConfig(allocationId).percentual || 0);
    const key = this.percentualMensalManualKey(allocationId, month);
    if (Math.abs(valorAjustado - base) < 0.0001) {
      delete this.percentualMensalManual[key];
      if (this.token) {
        this.api.upsertAllocationMonthlyState(this.token, allocationId, month, { manualPercent: null }).subscribe();
      }
    } else {
      const prev = this.percentualMensalManual[key];
      this.percentualMensalManual[key] = valorAjustado;
      if (this.token) {
        this.api.upsertAllocationMonthlyState(this.token, allocationId, month, { manualPercent: valorAjustado }).subscribe({
          error: () => {
            if (prev == null) delete this.percentualMensalManual[key];
            else this.percentualMensalManual[key] = prev;
            this.percentualAviso = 'Falha ao salvar percentual mensal no servidor.';
          }
        });
      }
    }
    if (valor > maxPermitido) {
      this.percentualAviso = `Percentual ajustado para ${maxPermitido.toFixed(2)}% (limite disponível no mês ${this.meses[month]}).`;
    } else {
      this.percentualAviso = '';
    }
  }

  isPercentualMesSobrescrito(allocationId: string, month: number): boolean {
    return this.getPercentualMensalManual(allocationId, month) != null;
  }

  private getPercentualMensalManual(allocationId: string, month: number): number | null {
    const key = this.percentualMensalManualKey(allocationId, month);
    return this.percentualMensalManual[key] ?? null;
  }

  private percentualMensalManualKey(allocationId: string, month: number): string {
    return `planner_lo_alloc_monthly_${allocationId}_${month}`;
  }

  private getPercentualEfetivoMes(allocationId: string, month: number): number {
    const mensal = this.getPercentualMensalManual(allocationId, month);
    if (mensal != null) return mensal;
    return Number(this.getConfig(allocationId).percentual || 0);
  }

  percentualMesAlocacao(allocationId: string, month: number): number {
    return this.round2(this.getPercentualEfetivoMes(allocationId, month));
  }

  percentualLivreMesAlocacao(allocationId: string, month: number): number {
    if (this.mesIndisponivelParaAlocacao(allocationId, month)) return 0;
    const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
    const percentualTotal = this.alocacoes
      .filter((a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa))
      .filter((a: any) => this.mesAtivoParaAlocacao(a.id, month))
      .reduce((acc: number, a: any) => acc + Number(this.getPercentualEfetivoMes(a.id, month) || 0), 0);
    return this.round2(Math.max(0, 100 - percentualTotal));
  }

  mesIndisponivelParaAlocacao(allocationId: string, month: number): boolean {
    return this.disponibilidadeMesParaLinha(allocationId, month).indisponivel;
  }

  motivoMesIndisponivelAlocacao(allocationId: string, month: number): string {
    const loId = this.loIdBloqueanteMes(allocationId, month);
    if (loId && loId === this.loSelecionadaId) return 'Já alocado nessa LO';
    return this.disponibilidadeMesParaLinha(allocationId, month).motivo || 'Indisponível';
  }

  
  loIdBloqueanteMes(allocationId: string, month: number): string | null {
    if (!this.mesIndisponivelParaAlocacao(allocationId, month)) return null;
    const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
    const linhasDaPessoa = this.alocacoes.filter(
      (a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa)
    );
    
    const comControle = linhasDaPessoa.find(
      (a: any) => a.id !== allocationId && this.mesComControleExplicito(a.id, month)
    );
    if (comControle) return comControle.linhaOrcamentariaId || null;
    
    const thisIndex = linhasDaPessoa.findIndex((a: any) => a.id === allocationId);
    if (thisIndex > 0) {
      const dona = linhasDaPessoa.slice(0, thisIndex).find((a: any) => !this.isCancelado(a.id, month));
      return dona?.linhaOrcamentariaId || null;
    }
    return null;
  }

  
  loIdBloqueanteMesNovaPessoa(month: number): string | null {
    if (!this.mesIndisponivelNovaPessoa(month)) return null;
    const nomePessoa = this.form.nomePessoa || '';
    if (!this.normalized(nomePessoa)) return null;
    const candidatas = this.alocacoes.filter(
      (a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa)
    );
    const explicita = candidatas.find((a: any) => this.mesComControleExplicito(a.id, month));
    if (explicita) return explicita.linhaOrcamentariaId || null;
    const ativa = candidatas.find((a: any) => this.mesAtivoParaAlocacao(a.id, month));
    return ativa?.linhaOrcamentariaId || null;
  }

  navegarParaLo(loId: string | null) {
    if (loId && loId !== this.loSelecionadaId) this.selectLoTab(loId);
  }

  
  bloqueantePorOutraLo(loId: string | null): boolean {
    return !!loId && loId !== this.loSelecionadaId;
  }

  
  percentualDisponivelParaLinha(allocationId: string, month: number): number {
    if (this.isPago(allocationId, month) || this.isCancelado(allocationId, month)) return 100;

    const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
    const linhasDaPessoa = this.alocacoes.filter(
      (a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa)
    );

    
    const comControle = linhasDaPessoa.find(
      (a: any) => a.id !== allocationId && this.mesComControleExplicito(a.id, month)
    );
    if (comControle) return 0;

    
    const thisIndex = linhasDaPessoa.findIndex((a: any) => a.id === allocationId);
    const percentualAnterior = thisIndex > 0
      ? linhasDaPessoa
          .slice(0, thisIndex)
          .filter((a: any) => !this.isCancelado(a.id, month))
          .reduce((sum: number, a: any) => sum + Number(this.getPercentualEfetivoMes(a.id, month) || 0), 0)
      : 0;

    return Math.max(0, 100 - percentualAnterior);
  }

  
  private disponibilidadeMesParaLinha(allocationId: string, month: number): { indisponivel: boolean; motivo: string } {
    if (this.isPago(allocationId, month) || this.isCancelado(allocationId, month)) {
      return { indisponivel: false, motivo: '' };
    }

    const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
    const linhasDaPessoa = this.alocacoes.filter(
      (a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa)
    );

    
    const comControle = linhasDaPessoa.find(
      (a: any) => a.id !== allocationId && this.mesComControleExplicito(a.id, month)
    );
    if (comControle) {
      const lo = this.loResumoDaAlocacao(comControle);
      return { indisponivel: true, motivo: `Pago/Lançado na LO ${lo}` };
    }

    
    const thisIndex = linhasDaPessoa.findIndex((a: any) => a.id === allocationId);
    if (thisIndex > 0) {
      const percentualAnterior = linhasDaPessoa
        .slice(0, thisIndex)
        .filter((a: any) => !this.isCancelado(a.id, month))
        .reduce((sum: number, a: any) => sum + Number(this.getPercentualEfetivoMes(a.id, month) || 0), 0);
      if (percentualAnterior >= 100) {
        const dona = linhasDaPessoa.slice(0, thisIndex).find((a: any) => !this.isCancelado(a.id, month));
        const lo = dona ? this.loResumoDaAlocacao(dona) : '-';
        return { indisponivel: true, motivo: `Alocado na LO ${lo}` };
      }
    }

    return { indisponivel: false, motivo: '' };
  }

  private percentualAtivoOutrasAlocacoesNoMes(nomePessoa: string, month: number, excludeAllocationId: string): number {
    return this.alocacoes
      .filter((a: any) => a.id !== excludeAllocationId)
      .filter((a: any) => !a.draft)
      .filter((a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa))
      .filter((a: any) => this.mesAtivoParaAlocacao(a.id, month))
      .reduce((acc: number, a: any) => acc + Number(this.getPercentualEfetivoMes(a.id, month) || 0), 0);
  }

  private mesAtivoParaAlocacao(allocationId: string, month: number): boolean {
    if (this.isCancelado(allocationId, month)) return false;
    if (this.isPago(allocationId, month)) return true;
    if ((this.getValorMensalManual(allocationId, month) ?? 0) > 0) return true;
    
    
    if (this.getPercentualEfetivoMes(allocationId, month) > 0) return true;
    return this.valorMesEfetivo(allocationId, month) > 0;
  }

  
  private mesComControleExplicito(allocationId: string, month: number): boolean {
    if (this.isCancelado(allocationId, month)) return false;
    return this.isPago(allocationId, month);
  }

  private disponibilidadeMes(nomePessoa: string, month: number, excludeAllocationId = ''): { indisponivel: boolean; motivo: string } {
    const candidatas = this.alocacoes
      .filter((a: any) => (!excludeAllocationId || a.id !== excludeAllocationId))
      .filter((a: any) => !a.draft)
      .filter((a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa));
    if (!candidatas.length) return { indisponivel: false, motivo: '' };

    const explicita = candidatas.find((a: any) => this.mesComControleExplicito(a.id, month));
    if (explicita) {
      const lo = this.loResumoDaAlocacao(explicita);
      if (this.isPago(explicita.id, month)) return { indisponivel: true, motivo: `Pago na LO ${lo}` };
      return { indisponivel: true, motivo: `Lançado na LO ${lo}` };
    }

    const ativas = candidatas.filter((a: any) => this.mesAtivoParaAlocacao(a.id, month));
    const percentualTotal = ativas.reduce((acc: number, a: any) => acc + Number(this.getPercentualEfetivoMes(a.id, month) || 0), 0);
    if (percentualTotal >= 100) {
      const lo = ativas[0] ? this.loResumoDaAlocacao(ativas[0]) : '-';
      return { indisponivel: true, motivo: `Alocado na LO ${lo}` };
    }

    return { indisponivel: false, motivo: '' };
  }

  private profissionalSemDisponibilidadeNoAno(nomePessoa: string): boolean {
    for (let month = 0; month < 12; month++) {
      if (!this.disponibilidadeMes(nomePessoa, month).indisponivel) return false;
    }
    return true;
  }

  private percentualDisponivelNoMes(nomePessoa: string, month: number): number {
    const candidatas = this.alocacoes
      .filter((a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa));
    if (!candidatas.length) return 100;
    const explicita = candidatas.find((a: any) => this.mesComControleExplicito(a.id, month));
    if (explicita) return 0;
    const percentualTotal = candidatas
      .filter((a: any) => this.mesAtivoParaAlocacao(a.id, month))
      .reduce((acc: number, a: any) => acc + Number(this.getPercentualEfetivoMes(a.id, month) || 0), 0);
    return Math.max(0, 100 - percentualTotal);
  }

  private percentualMaximoNovaAlocacao(nomePessoa: string): number {
    const disponiveis: number[] = [];
    for (let month = 0; month < 12; month++) {
      const d = this.disponibilidadeMes(nomePessoa, month);
      if (d.indisponivel) continue;
      disponiveis.push(this.percentualDisponivelNoMes(nomePessoa, month));
    }
    if (!disponiveis.length) return 0;
    return Math.max(0, Math.min(...disponiveis));
  }

  private ownerAtivoNoMes(nomePessoa: string, month: number): string | null {
    const candidatas = this.alocacoes
      .filter((a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa))
      .filter((a: any) => this.mesAtivoParaAlocacao(a.id, month));
    if (!candidatas.length) return null;
    const explicita = candidatas.find((a: any) => this.mesComControleExplicito(a.id, month));
    return (explicita?.id || candidatas[0]?.id || null);
  }

  private loResumoDaAlocacao(aloc: any): string {
    const lo = this.linhasOrcamentarias.find((x: any) => x.id === aloc?.linhaOrcamentariaId);
    if (lo?.codigo) return String(lo.codigo).trim();
    const fallback = String(aloc?.linhaOrcamentariaCodigo || '').trim();
    if (!fallback) return '-';
    return fallback.split(' - ')[0].trim();
  }

  private valorMesEfetivo(allocationId: string, month: number): number {
    const aloc = this.alocacoes.find((a: any) => a.id === allocationId);
    if (!aloc) return 0;
    const valorHora = this.getValorHoraDaAlocacao(aloc);
    return this.round2(this.custoMensalCalculado(allocationId, valorHora, month));
  }

  private round2(value: number): number {
    return Number(value.toFixed(2));
  }

  
  exportarExcel() {
    
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();
      const brl = (v: number) => Number(v.toFixed(2));
      const mesesHeader = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

      
      const pessoaRows: any[] = [];
      pessoaRows.push(['Pessoa', 'LO', 'Perfil', 'Categoria', 'Alocação %',
        ...mesesHeader, 'Total Anual']);

      const alocAno = this.alocacoes.filter((a: any) =>
        this.linhasDoAnoSelecionado().some((lo: any) => lo.id === a.linhaOrcamentariaId)
      );
      
      const byPessoa = [...alocAno].sort((a: any, b: any) =>
        String(a.nomePessoa || '').localeCompare(String(b.nomePessoa || ''), 'pt-BR', { sensitivity: 'base' })
      );
      for (const a of byPessoa) {
        const lo = this.linhasOrcamentarias.find((l: any) => l.id === a.linhaOrcamentariaId);
        const loLabel = lo ? `${lo.codigo || ''} - ${lo.nome || ''}`.trim().replace(/^-/, '').trim() : '-';
        const vh = this.getValorHoraDaAlocacao(a);
        const mesesCustos = mesesHeader.map((_, mi) => brl(this.custoMensal(a.id, vh, mi)));
        const total = brl(mesesCustos.reduce((s, v) => s + v, 0));
        pessoaRows.push([
          a.nomePessoa || '-',
          loLabel,
          a.perfilNome || '-',
          this.getCategoriaDaPessoa(a),
          Number(this.getConfig(a.id).percentual || 0),
          ...mesesCustos,
          total
        ]);
      }
      const wsPessoa = XLSX.utils.aoa_to_sheet(pessoaRows);
      this.applyExcelStyle(wsPessoa, pessoaRows[0].length);
      XLSX.utils.book_append_sheet(wb, wsPessoa, 'Por Pessoa');

      
      const loRows: any[] = [];
      loRows.push(['LO', 'Código', 'Pessoa', 'Perfil', 'Categoria',
        ...mesesHeader, 'Comprometido', 'Orçamento', 'Saldo']);

      const losSorted = [...this.linhasDoAnoSelecionado()].sort((a: any, b: any) =>
        String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { sensitivity: 'base' })
      );
      for (const lo of losSorted) {
        const alocacoesDaLo = alocAno.filter((a: any) => a.linhaOrcamentariaId === lo.id);
        const orcamento = this.num(lo.valorTotal) + this.ajustes
          .filter((aj: any) => aj.budgetLineId === lo.id)
          .reduce((s: number, aj: any) => s + (aj.tipo === 'CREDITO' ? this.num(aj.valor) : -this.num(aj.valor)), 0);

        for (const a of alocacoesDaLo) {
          const vh = this.getValorHoraDaAlocacao(a);
          const mesesCustos = mesesHeader.map((_, mi) => brl(this.custoMensal(a.id, vh, mi)));
          const comprometido = brl(mesesCustos.reduce((s, v) => s + v, 0));
          loRows.push([
            lo.nome || '-',
            lo.codigo || '-',
            a.nomePessoa || '-',
            a.perfilNome || '-',
            this.getCategoriaDaPessoa(a),
            ...mesesCustos,
            comprometido,
            brl(orcamento),
            brl(orcamento - comprometido)
          ]);
        }
        if (!alocacoesDaLo.length) {
          loRows.push([lo.nome || '-', lo.codigo || '-', '(sem alocações)', '', '', ...mesesHeader.map(() => 0), 0, brl(orcamento), brl(orcamento)]);
        }
      }
      const wsLo = XLSX.utils.aoa_to_sheet(loRows);
      this.applyExcelStyle(wsLo, loRows[0].length);
      XLSX.utils.book_append_sheet(wb, wsLo, 'Por LO');

      
      const atividadeRows: any[] = [];
      atividadeRows.push(['Projeto', 'Atividade', 'Status', 'Responsável', 'Início Planejado', 'Fim Planejado']);

      const atividadesSorted = [...this.atividades].sort((a: any, b: any) =>
        String(a.projetoNome || '').localeCompare(String(b.projetoNome || ''), 'pt-BR', { sensitivity: 'base' })
      );
      for (const a of atividadesSorted) {
        atividadeRows.push([
          a.projetoNome || '-',
          a.titulo || '-',
          a.status || '-',
          a.responsavel || '(sem responsável)',
          a.inicioPlanejado ? new Date(a.inicioPlanejado).toLocaleDateString('pt-BR') : '-',
          a.fimPlanejado ? new Date(a.fimPlanejado).toLocaleDateString('pt-BR') : '-'
        ]);
      }
      const wsAtiv = XLSX.utils.aoa_to_sheet(atividadeRows);
      this.applyExcelStyle(wsAtiv, atividadeRows[0].length);
      XLSX.utils.book_append_sheet(wb, wsAtiv, 'Por Atividade');

      this.appendTimeSheets(wb, XLSX);
      
      const dt = new Date();
      const fileName = `alocacoes_${this.anoSelecionado}_${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    });
  }

  exportarTimeExcel() {
    const lo = this.loSelecionada();
    if (!lo) {
      this.percentualAviso = 'Selecione uma LO para exportar o time.';
      return;
    }

    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();
      this.appendTimeSheets(wb, XLSX);
      const dt = new Date();
      const stamp = `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}`;
      const codigo = this.safeFilePart(lo.codigo || lo.nome || 'time');
      XLSX.writeFile(wb, `time_${codigo}_${this.anoSelecionado}_${stamp}.xlsx`);
    });
  }

  // Texto explicativo (comentário do Excel) quando o mês tem alocação personalizada:
  // % diferente do padrão da linha, horas reduzidas por ausência ou valor manual.
  private comentarioAlocacaoMes(a: any, month: number): string | null {
    const fmtPct = (v: number) => `${(Number(v) || 0).toFixed(2).replace('.', ',')}%`;
    const partes: string[] = [];
    const padrao = Number(this.getConfig(a.id).percentual || 0);

    if (this.isPercentualMesSobrescrito(a.id, month)) {
      const mesPct = this.getPercentualMensalDigitavel(a.id, month);
      partes.push(`Alocação do mês: ${fmtPct(mesPct)} (padrão da linha: ${fmtPct(padrao)}).`);
    }
    if (this.temReducaoPorAusencia(a.id, month)) {
      const h = this.horasDescontadasPorAusencia(a.id, month);
      partes.push(`Horas reduzidas por ausência/férias: -${h}h neste mês.`);
    }
    if (this.getValorMensalManual(a.id, month) != null) {
      partes.push('Valor do mês informado manualmente (diferente do cálculo padrão).');
    }
    return partes.length ? partes.join('\n') : null;
  }

  /**
   * Extração da "Visão LO" em uma única aba, reproduzindo o layout e a
   * formatação da tela: bloco RESUMO, bloco "Realizado Extraído de Finanças"
   * (Comprometido/Realizado/Delta por Folha e CLM) e a tabela do time com
   * 12 meses + total e a linha de Horas Úteis Mês.
   */
  exportarVisaoLoExcel() {
    const lo = this.loSelecionada();
    if (!lo) {
      this.percentualAviso = 'Selecione uma LO para extrair a visão.';
      return;
    }

    import('xlsx-js-style').then((mod: any) => {
      const XLSX = mod.default ?? mod;
      const wb = XLSX.utils.book_new();
      const brl = (v: number) => Number((Number(v) || 0).toFixed(2));
      const ano = this.anoSelecionado;
      const NCOL = 21;                 // 8 fixas + 12 meses + TOTAL
      const MES0 = 8;                  // 1ª coluna de mês (JAN)
      const COL_TOTAL = 20;

      const thin = { style: 'thin', color: { rgb: 'BFBFBF' } };
      const border = { top: thin, bottom: thin, left: thin, right: thin };
      const S = {
        resumoTitle: { fill: { fgColor: { rgb: 'ED7D31' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' }, border },
        greenTitle:  { fill: { fgColor: { rgb: '375623' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'left', vertical: 'center' }, border },
        monthHead:   { fill: { fgColor: { rgb: '70AD47' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' }, border },
        blueHead:    { fill: { fgColor: { rgb: '2F75B5' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' }, border },
        label:       { fill: { fgColor: { rgb: 'F2F2F2' } }, font: { bold: true }, border },
        greenLabel:  { fill: { fgColor: { rgb: 'E2EFDA' } }, font: { bold: true }, border },
        money:       { border, alignment: { horizontal: 'right' } },
        moneyBold:   { border, font: { bold: true }, alignment: { horizontal: 'right' } },
        text:        { border },
        pct:         { border, alignment: { horizontal: 'center' } },
        horasLabel:  { fill: { fgColor: { rgb: 'D9E1F2' } }, font: { bold: true }, border },
        horas:       { fill: { fgColor: { rgb: 'D9E1F2' } }, border, alignment: { horizontal: 'center' } },
      };
      const Z_MONEY = 'R$ #,##0.00';
      const Z_RS = 'R$ #,##0.00';

      const cells: Record<string, any> = {};
      const merges: any[] = [];
      const set = (r: number, c: number, cell: any) => { cells[XLSX.utils.encode_cell({ r, c })] = cell; };
      const txt = (v: any, s = S.text) => ({ t: 's', v: v == null ? '' : String(v), s });
      const money = (v: number, s = S.money) => ({ t: 'n', v: brl(v), z: Z_MONEY, s });
      const moneyRS = (v: number, s = S.money) => ({ t: 'n', v: brl(v), z: Z_RS, s });
      const pctc = (v: number, s = S.pct) => ({ t: 'n', v: Number(v) || 0, z: '0.00"%"', s });
      const numc = (v: number, s = S.horas) => ({ t: 'n', v: Number(v) || 0, s });
      const mergeRow = (r: number, c0: number, c1: number) => merges.push({ s: { r, c: c0 }, e: { r, c: c1 } });
      const addr = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
      // Célula com fórmula (mantém valor em cache para visualização antes do recálculo).
      const fcell = (formula: string, value: number, s = S.money) => ({ t: 'n', f: formula, v: brl(value), z: Z_MONEY, s });
      let R = 0;

      // ── Bloco RESUMO ──────────────────────────────────────────────────────
      set(R, 0, txt(`RESUMO — ${lo.codigo || ''} ${lo.nome || ''}`.trim(), S.resumoTitle));
      for (let c = 1; c <= 4; c++) set(R, c, txt('', S.resumoTitle));
      mergeRow(R, 0, 4); R++;

      const realizadoTotal = this.totalPagoNaLoSelecionada();
      const eficiencia = this.eficienciaLoSelecionada();
      const resumoRow: Record<string, number> = {};
      const resumoDefs: Array<[string, string]> = [
        [`Orçamento ${ano}`, 'orc'],
        ['Comprometido', 'comp'],
        ['Realizado', 'real'],
        ['Eficiência Realizada', 'efr'],
        ['Eficiência Comprometida', 'efc'],
        ['Saldo', 'saldo'],
      ];
      for (const [label, kind] of resumoDefs) {
        set(R, 0, txt(label, S.label));
        for (let c = 1; c <= 2; c++) set(R, c, txt('', S.label));
        mergeRow(R, 0, 2);
        mergeRow(R, 3, 4);
        resumoRow[kind] = R;
        R++;
      }
      // Orçamento é dado base; os demais viram fórmulas (preenchidas no fim).
      set(resumoRow['orc'], 3, money(this.orcamentoLoSelecionada(), S.moneyBold));
      R++; // linha em branco

      // ── Realizado Extraído de Finanças (por Folha e CLM) ──────────────────
      set(R, 0, txt('Realizado Extraído de Finanças', S.greenTitle));
      for (let c = 1; c < NCOL; c++) set(R, c, txt('', S.greenTitle));
      mergeRow(R, 0, NCOL - 1); R++;

      // cabeçalho de meses
      set(R, 0, txt('', S.monthHead)); for (let c = 1; c < MES0; c++) set(R, c, txt('', S.monthHead));
      mergeRow(R, 0, MES0 - 1);
      this.meses.forEach((m, i) => set(R, MES0 + i, txt(m, S.monthHead)));
      set(R, COL_TOTAL, txt('TOTAL', S.monthHead)); R++;

      const labelFin = (label: string) => { set(R, 0, txt(label, S.greenLabel)); for (let c = 1; c < MES0; c++) set(R, c, txt('', S.greenLabel)); mergeRow(R, 0, MES0 - 1); };
      // Linha de valores (dados mensais) com TOTAL como fórmula =SUM(JAN:DEZ).
      const linhaValores = (label: string, fn: (m: number) => number): number => {
        labelFin(label);
        let total = 0;
        this.meses.forEach((_m, i) => { const v = fn(i); total += v; set(R, MES0 + i, money(v)); });
        set(R, COL_TOTAL, fcell(`SUM(${addr(R, MES0)}:${addr(R, 19)})`, total, S.moneyBold));
        return R++;
      };
      // Linha de delta: cada mês = Realizado − Comprometido (fórmula), TOTAL idem.
      const linhaDelta = (label: string, rReal: number, rComp: number, valFn: (m: number) => number): number => {
        labelFin(label);
        this.meses.forEach((_m, i) => {
          const c = MES0 + i;
          set(R, c, fcell(`${addr(rReal, c)}-${addr(rComp, c)}`, valFn(i), S.money));
        });
        set(R, COL_TOTAL, fcell(`${addr(rReal, COL_TOTAL)}-${addr(rComp, COL_TOTAL)}`, this.meses.reduce((s, _m, i) => s + valFn(i), 0), S.moneyBold));
        return R++;
      };
      // Eficiência (movimentações negativas) — total anual, sem distribuição mensal.
      const linhaEficiencia = (label: string): number => {
        labelFin(label);
        this.meses.forEach((_m, i) => set(R, MES0 + i, money(0)));
        set(R, COL_TOTAL, money(eficiencia, S.moneyBold));
        return R++;
      };
      const compFolhaFn = (m: number) => this.totalComprometidoMesPorCategoria(m, 'FOLHA');
      const realFolhaFn = (m: number) => this.realizadoMesPorCategoria(m, 'FOLHA');
      const compClmFn = (m: number) => this.totalComprometidoMesPorCategoria(m, 'TERCEIRO');
      const realClmFn = (m: number) => this.realizadoMesPorCategoria(m, 'TERCEIRO');

      const rEfReal = linhaEficiencia('Eficiência Realizada');
      const rEfComp = linhaEficiencia('Eficiência Comprometida');
      const rCompFolha = linhaValores('Comprometido Folha', compFolhaFn);
      const rRealFolha = linhaValores('Realizado Folha', realFolhaFn);
      linhaDelta('Delta Folha (Realizado − Comprometido)', rRealFolha, rCompFolha, m => realFolhaFn(m) - compFolhaFn(m));
      const rCompClm = linhaValores('Comprometido CLM', compClmFn);
      const rRealClm = linhaValores('Realizado CLM', realClmFn);
      linhaDelta('Delta CLM (Realizado − Comprometido)', rRealClm, rCompClm, m => realClmFn(m) - compClmFn(m));
      R++; // linha em branco

      // ── Tabela do time ────────────────────────────────────────────────────
      const headers = ['Nome', 'VAGA', 'Frente', 'Parceiro', 'Perfil', 'Cargo', 'Alocação %', 'Valor Hora', ...this.meses, 'TOTAL'];
      const tableHeaderRow = R;
      headers.forEach((h, c) => set(R, c, txt(h, S.blueHead))); R++;

      // Obedece a ordem exibida na tela (ordenação custom / coluna ordenada).
      const alocacoesLo = this.alocacoesFiltradas();
      const firstDataRow = R;

      // Cores por tipo (iguais à tela): planejada=roxo claro, folha=azul claro, terceiro=laranja.
      const filled = (base: any, rgb: string) => ({ ...base, fill: { fgColor: { rgb } } });
      for (const a of alocacoesLo) {
        const nome = a.nomePessoa || '-';
        const pessoa = this.pessoaPorNome(nome);
        const vh = this.getValorHoraDaAlocacao(a);
        const planejada = this.isPessoaPlaneada(a);
        const terceiro = this.getCategoriaDaPessoa(a) === 'TERCEIRO';
        const rgb = planejada ? 'EDE9FE' : terceiro ? 'FFE4CC' : 'E8F4FD';
        const stText = filled(S.text, rgb);
        const stMoney = filled(S.money, rgb);
        const stPct = filled(S.pct, rgb);
        // Vaga: mostra o alias (ex.: VAG0022976) — terceiros e planejadas inclusos.
        const vaga = pessoa?.vagaAlias || (planejada ? 'Vaga programada' : '');
        set(R, 0, txt(nome, stText));
        set(R, 1, txt(vaga, stText));
        set(R, 2, txt('', stText));
        set(R, 3, txt(planejada ? 'Planejada' : (pessoa?.consultoria || pessoa?.tipoVinculo || this.getCategoriaDaPessoa(a)), stText));
        set(R, 4, txt(a.perfilNome || '-', stText));
        set(R, 5, txt(pessoa?.cargo || '', stText));
        set(R, 6, pctc(Number(this.getConfig(a.id).percentual || 0), stPct));
        set(R, 7, moneyRS(vh, stMoney));
        let total = 0;
        this.meses.forEach((_m, i) => {
          // Mesmo valor exibido na célula da tela: já desconta horas de ausência/férias
          // e respeita valor manual; meses cancelados/indisponíveis não geram custo.
          const v = (this.isCancelado(a.id, i) || this.mesIndisponivelParaAlocacao(a.id, i))
            ? 0
            : this.getValorMensalDigitavel(a.id, i, vh);
          total += v;
          // A partir do Valor Hora as cores são por status: pago=verde, cancelado=cinza, aberto=branco.
          const stMes = this.isPago(a.id, i) ? filled(S.money, 'C6EFCE')
                      : this.isCancelado(a.id, i) ? filled(S.money, 'D9D9D9')
                      : S.money;
          const celMes: any = money(v, stMes);
          // Comentário explicando alocação personalizada (ausência / % diferente do padrão / valor manual).
          const obs = this.comentarioAlocacaoMes(a, i);
          if (obs) celMes.c = Object.assign([{ a: 'Planner', t: obs }], { hidden: true });
          set(R, MES0 + i, celMes);
        });
        // TOTAL por pessoa = soma dos 12 meses (fórmula) — sem cor da linha.
        set(R, COL_TOTAL, fcell(`SUM(${addr(R, MES0)}:${addr(R, 19)})`, total, S.moneyBold));
        R++;
      }
      const lastDataRow = R - 1;
      const tableLastRow = Math.max(tableHeaderRow, lastDataRow);
      const hasData = lastDataRow >= firstDataRow;

      // Total comprometido por mês = soma da coluna do mês (fórmula).
      const rTotalComp = R;
      set(R, 0, txt('Total comprometido', S.label)); for (let c = 1; c < MES0; c++) set(R, c, txt('', S.label));
      mergeRow(R, 0, MES0 - 1);
      this.meses.forEach((_m, i) => {
        const c = MES0 + i;
        set(R, c, hasData
          ? fcell(`SUM(${addr(firstDataRow, c)}:${addr(lastDataRow, c)})`, this.totalComprometidoMesLo(i), S.moneyBold)
          : money(0, S.moneyBold));
      });
      set(R, COL_TOTAL, fcell(`SUM(${addr(rTotalComp, MES0)}:${addr(rTotalComp, 19)})`, this.totalComprometidoClm(), S.moneyBold)); R++;
      R++;

      // Horas Úteis Mês
      set(R, 0, txt('Horas Úteis Mês', S.horasLabel)); for (let c = 1; c < MES0; c++) set(R, c, txt('', S.horasLabel));
      mergeRow(R, 0, MES0 - 1);
      const rHoras = R;
      let totalHoras = 0;
      this.meses.forEach((_m, i) => { const h = this.horasDoCadastro(i); totalHoras += h; set(R, MES0 + i, numc(h)); });
      set(R, COL_TOTAL, { t: 'n', f: `SUM(${addr(rHoras, MES0)}:${addr(rHoras, 19)})`, v: totalHoras, s: { ...S.horas, font: { bold: true } } } as any); R++;

      // ── Fórmulas do RESUMO (referenciam os blocos acima) ──────────────────
      set(resumoRow['comp'], 3, fcell(`${addr(rCompFolha, COL_TOTAL)}+${addr(rCompClm, COL_TOTAL)}`, this.totalComprometidoClm(), S.moneyBold));
      set(resumoRow['real'], 3, fcell(`${addr(rRealFolha, COL_TOTAL)}+${addr(rRealClm, COL_TOTAL)}`, realizadoTotal, S.moneyBold));
      set(resumoRow['efr'], 3, fcell(`${addr(rEfReal, COL_TOTAL)}`, eficiencia, S.moneyBold));
      set(resumoRow['efc'], 3, fcell(`${addr(rEfComp, COL_TOTAL)}`, eficiencia, S.moneyBold));
      set(resumoRow['saldo'], 3, fcell(`${addr(resumoRow['orc'], 3)}-${addr(resumoRow['comp'], 3)}`, this.saldoLo(), S.moneyBold));

      const ws: any = cells;
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: R - 1, c: NCOL - 1 } });
      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 26 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 11 }, { wch: 12 },
        ...this.meses.map(() => ({ wch: 12 })), { wch: 14 }
      ];
      // Tabela ordenável/filtrável (AutoFilter sobre o cabeçalho + linhas do time).
      ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({ s: { r: tableHeaderRow, c: 0 }, e: { r: tableLastRow, c: NCOL - 1 } })
      };
      // Nome da aba = código da LO (ex.: FIN-310183). Sanitiza p/ regras do Excel (máx. 31, sem : \ / ? * [ ]).
      const sheetName = (String(lo.codigo || lo.nome || 'Visão LO').replace(/[:\\/?*\[\]]/g, ' ').trim() || 'Visão LO').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const dt = new Date();
      const stamp = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
      const codigo = this.safeFilePart(lo.codigo || lo.nome || 'lo');
      XLSX.writeFile(wb, `visao_lo_${codigo}_${ano}_${stamp}.xlsx`);
    });
  }

  exportarTimeImagem() {
    const lo = this.loSelecionada();
    if (!lo) {
      this.percentualAviso = 'Selecione uma LO para exportar o time.';
      return;
    }

    const rows = this.timeImagemRows();
    const width = 1800;
    const top = 324;
    const rowHeight = 108;
    const height = Math.max(1040, top + Math.max(1, rows.length) * rowHeight + 168);
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);

    const total = rows.reduce((sum, row) => sum + row.totalValor, 0);
    const totalHoras = rows.reduce((sum, row) => sum + row.totalHoras, 0);
    const orcamento = this.orcamentoLoSelecionada();
    const saldo = orcamento - total;
    const maxMes = Math.max(1, ...rows.flatMap(row => row.valoresMes));
    const mesesHeader = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(0.46, '#172554');
    bg.addColorStop(1, '#0f766e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#67e8f9';
    ctx.beginPath();
    ctx.arc(1450, 120, 280, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a7f3d0';
    ctx.beginPath();
    ctx.arc(220, height - 120, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    this.fillRoundRect(ctx, 54, 48, width - 108, height - 96, 36, 'rgba(255,255,255,.94)');
    this.fillRoundRect(ctx, 82, 78, width - 164, 184, 28, '#f8fafc');

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 54px Inter, Arial, sans-serif';
    ctx.fillText('Visão do time', 122, 146);
    ctx.font = '700 30px Inter, Arial, sans-serif';
    ctx.fillStyle = '#1d4ed8';
    ctx.fillText(String(lo.codigo || 'LO'), 122, 194);
    ctx.fillStyle = '#334155';
    ctx.font = '500 25px Inter, Arial, sans-serif';
    this.drawTextFit(ctx, String(lo.nome || '-'), 122, 232, 820);

    const chipY = 104;
    this.drawMetricCard(ctx, 1040, chipY, 180, 112, 'Pessoas', String(rows.length), '#0f766e');
    this.drawMetricCard(ctx, 1240, chipY, 190, 112, 'Horas', this.formatCompactNumber(totalHoras), '#7c3aed');
    this.drawMetricCard(ctx, 1450, chipY, 250, 112, 'Total', this.formatCompactCurrency(total), '#0369a1');

    this.fillRoundRect(ctx, 82, 280, width - 164, 62, 18, '#e0f2fe');
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 18px Inter, Arial, sans-serif';
    ctx.fillText('Pessoa', 132, 319);
    ctx.fillText('Perfil e vínculo', 400, 319);
    ctx.fillText('Meses', 690, 319);
    ctx.fillText('Total', 1548, 319);

    rows.forEach((row, index) => {
      const y = top + index * rowHeight;
      const alt = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      this.fillRoundRect(ctx, 82, y, width - 164, rowHeight - 14, 20, alt);

      const avatarColor = row.temRascunho && !row.temReal ? '#7c3aed' : row.categoria === 'TERCEIRO' ? '#0891b2' : '#2563eb';
      this.fillRoundRect(ctx, 122, y + 22, 56, 56, 18, avatarColor);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 21px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.initials(row.pessoa), 150, y + 58);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#0f172a';
      ctx.font = '800 23px Inter, Arial, sans-serif';
      this.drawTextFit(ctx, row.pessoa, 196, y + 46, 178);
      ctx.fillStyle = '#64748b';
      ctx.font = '600 15px Inter, Arial, sans-serif';
      ctx.fillText(row.situacao, 196, y + 70);

      ctx.fillStyle = '#1e293b';
      ctx.font = '700 18px Inter, Arial, sans-serif';
      this.drawTextFit(ctx, row.perfis, 400, y + 43, 240);
      ctx.fillStyle = '#64748b';
      ctx.font = '500 15px Inter, Arial, sans-serif';
      this.drawTextFit(ctx, [row.categoria, row.consultoria].filter(Boolean).join(' • ') || '-', 400, y + 68, 240);

      row.valoresMes.forEach((valor, month) => {
        const x = 690 + month * 68;
        const barH = Math.max(5, Math.round((valor / maxMes) * 42));
        const barY = y + 68 - barH;
        ctx.fillStyle = '#e2e8f0';
        this.fillRoundRect(ctx, x, y + 24, 42, 46, 10, '#e2e8f0');
        ctx.fillStyle = row.temRascunho && !row.temReal ? '#a855f7' : '#14b8a6';
        this.fillRoundRect(ctx, x, barY, 42, barH, 10, ctx.fillStyle as string);
        ctx.fillStyle = '#475569';
        ctx.font = '700 11px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(mesesHeader[month], x + 21, y + 88);
        ctx.textAlign = 'left';
      });

      ctx.fillStyle = '#0f172a';
      ctx.font = '800 21px Inter, Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(this.formatCompactCurrency(row.totalValor), 1660, y + 44);
      ctx.fillStyle = '#64748b';
      ctx.font = '600 15px Inter, Arial, sans-serif';
      ctx.fillText(`${this.formatCompactNumber(row.totalHoras)}h`, 1660, y + 68);
      ctx.textAlign = 'left';
    });

    if (!rows.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '700 28px Inter, Arial, sans-serif';
      ctx.fillText('Nenhuma alocação nesta LO.', 122, top + 72);
    }

    const footerY = height - 120;
    ctx.fillStyle = '#334155';
    ctx.font = '700 19px Inter, Arial, sans-serif';
    ctx.fillText(`Orçamento ajustado: ${this.currency(orcamento)}   •   Saldo projetado: ${this.currency(saldo)}   •   Ano ${this.anoSelecionado}`, 122, footerY);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 15px Inter, Arial, sans-serif';
    // ctx.fillText(`Gerado em ${new Date().toLocaleDateString('pt-BR')} pelo Planner`, 122, footerY + 32);
    ctx.fillText(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 122, footerY + 32);

    const link = document.createElement('a');
    link.download = `time_${this.safeFilePart(lo.codigo || lo.nome || 'time')}_${this.anoSelecionado}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  private appendTimeSheets(wb: any, XLSX: any) {
    const lo = this.loSelecionada();
    if (!lo) return;

    const brl = (v: number) => Number(v.toFixed(2));
    const pct = (v: number) => Number(v.toFixed(2));
    const mesesHeader = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const alocacoesTime = this.alocacoes
      .filter((a: any) => a.linhaOrcamentariaId === lo.id)
      .sort((a: any, b: any) => {
        const byPessoa = String(a.nomePessoa || '').localeCompare(String(b.nomePessoa || ''), 'pt-BR', { sensitivity: 'base' });
        if (byPessoa !== 0) return byPessoa;
        return String(a.perfilNome || '').localeCompare(String(b.perfilNome || ''), 'pt-BR', { sensitivity: 'base' });
      });

    const resumoMap = new Map<string, any>();
    for (const a of alocacoesTime) {
      const nome = String(a.nomePessoa || '-').trim() || '-';
      const key = this.normalized(nome);
      const pessoa = this.pessoaPorNome(nome);
      const valorHora = this.getValorHoraDaAlocacao(a);
      const categoria = this.getCategoriaDaPessoa(a);
      const row = resumoMap.get(key) ?? {
        pessoa: nome,
        categoria,
        tipoVinculo: pessoa?.tipoVinculo || categoria,
        consultoria: pessoa?.consultoria || '',
        perfis: new Set<string>(),
        alocacoes: 0,
        temReal: false,
        temRascunho: false,
        contaNosTotais: false,
        valoresHora: [] as number[],
        horasMes: Array(12).fill(0),
        valoresMes: Array(12).fill(0),
      };

      row.perfis.add(a.perfilNome || '-');
      row.alocacoes += 1;
      row.temReal = row.temReal || !a.draft;
      row.temRascunho = row.temRascunho || !!a.draft;
      row.contaNosTotais = row.contaNosTotais || this.alocacaoContaNoResumoLo(a);
      row.valoresHora.push(valorHora);

      for (let month = 0; month < 12; month++) {
        row.horasMes[month] += this.horasMensaisExportacao(a, month);
        row.valoresMes[month] += this.round2(this.custoMensal(a.id, valorHora, month));
      }
      resumoMap.set(key, row);
    }

    const metaRows = [
      ['LO', lo.nome || '-'],
      ['Código', lo.codigo || '-'],
      ['Ano', this.anoSelecionado],
      ['Situação', lo.situacao === 'DRAFT' ? 'Rascunho' : 'Publicada'],
      ['Orçamento ajustado', brl(this.orcamentoLoSelecionada())],
      ['Total do time', brl(alocacoesTime.reduce((sum: number, a: any) => {
        const valorHora = this.getValorHoraDaAlocacao(a);
        return sum + this.meses.reduce((acc: number, _m: string, month: number) => acc + this.round2(this.custoMensal(a.id, valorHora, month)), 0);
      }, 0))],
      ['Saldo projetado', brl(this.orcamentoLoSelecionada() - alocacoesTime.reduce((sum: number, a: any) => {
        const valorHora = this.getValorHoraDaAlocacao(a);
        return sum + this.meses.reduce((acc: number, _m: string, month: number) => acc + this.round2(this.custoMensal(a.id, valorHora, month)), 0);
      }, 0))],
      [],
    ];

    const resumoRows: any[] = [
      ...metaRows,
      ['Pessoa', 'Categoria', 'Tipo vínculo', 'Consultoria', 'Perfis', 'Alocações', 'Situação', 'Conta nos totais', 'Valor/h médio',
        ...mesesHeader.map(m => `${m} Valor`), 'Total Anual',
        ...mesesHeader.map(m => `${m} Horas`), 'Total Horas']
    ];

    for (const row of [...resumoMap.values()].sort((a: any, b: any) =>
      String(a.pessoa || '').localeCompare(String(b.pessoa || ''), 'pt-BR', { sensitivity: 'base' })
    )) {
      const valores = row.valoresMes.map((v: number) => brl(v));
      const horas = row.horasMes.map((v: number) => pct(v));
      const totalValor = brl(valores.reduce((sum: number, v: number) => sum + v, 0));
      const totalHoras = pct(horas.reduce((sum: number, v: number) => sum + v, 0));
      resumoRows.push([
        row.pessoa,
        row.categoria,
        row.tipoVinculo || '-',
        row.consultoria || '-',
        [...row.perfis].join(', '),
        row.alocacoes,
        row.temReal && row.temRascunho ? 'Real + rascunho' : row.temRascunho ? 'Rascunho' : 'Real',
        row.contaNosTotais ? 'Sim' : 'Não',
        brl(row.valoresHora.reduce((sum: number, v: number) => sum + v, 0) / Math.max(1, row.valoresHora.length)),
        ...valores,
        totalValor,
        ...horas,
        totalHoras
      ]);
    }

    const detalheHeader = ['LO', 'Código', 'Pessoa', 'Perfil', 'Categoria', 'Tipo vínculo', 'Consultoria', 'Situação', 'Conta nos totais', 'Valor/h', 'Percentual padrão'];
    for (const mes of mesesHeader) {
      detalheHeader.push(`${mes} %`, `${mes} Horas`, `${mes} Valor`, `${mes} Status`);
    }
    detalheHeader.push('Total Horas', 'Total Valor');
    const detalheRows: any[] = [detalheHeader];

    for (const a of alocacoesTime) {
      const nome = a.nomePessoa || '-';
      const pessoa = this.pessoaPorNome(nome);
      const valorHora = this.getValorHoraDaAlocacao(a);
      const row: any[] = [
        lo.nome || '-',
        lo.codigo || '-',
        nome,
        a.perfilNome || '-',
        this.getCategoriaDaPessoa(a),
        pessoa?.tipoVinculo || '-',
        pessoa?.consultoria || '-',
        a.draft ? 'Rascunho' : 'Real',
        this.alocacaoContaNoResumoLo(a) ? 'Sim' : 'Não',
        brl(valorHora),
        pct(Number(this.getConfig(a.id).percentual || 0)),
      ];
      let totalHoras = 0;
      let totalValor = 0;
      for (let month = 0; month < 12; month++) {
        const horas = this.horasMensaisExportacao(a, month);
        const valor = this.round2(this.custoMensal(a.id, valorHora, month));
        totalHoras += horas;
        totalValor += valor;
        row.push(
          pct(this.getPercentualEfetivoMes(a.id, month)),
          pct(horas),
          brl(valor),
          this.statusMensalExportacao(a.id, month)
        );
      }
      row.push(pct(totalHoras), brl(totalValor));
      detalheRows.push(row);
    }

    if (!alocacoesTime.length) {
      detalheRows.push([lo.nome || '-', lo.codigo || '-', '(sem alocações)', '', '', '', '', '', '', 0, 0, ...Array(48).fill(''), 0, 0]);
    }

    const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
    this.applyExcelStyle(wsResumo, resumoRows[resumoRows.length > metaRows.length ? metaRows.length : 0]?.length || 8);
    wsResumo['!cols'] = this.timeResumoCols(resumoRows[metaRows.length]?.length || 12);
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Time Resumo');

    const wsDetalhe = XLSX.utils.aoa_to_sheet(detalheRows);
    wsDetalhe['!cols'] = this.timeDetalheCols(detalheHeader.length);
    XLSX.utils.book_append_sheet(wb, wsDetalhe, 'Time Detalhe');
  }

  private pessoaPorNome(nomePessoa: string): any | null {
    const nome = this.normalized(nomePessoa || '');
    return this.pessoas.find((p: any) => this.normalized(p?.nome || '') === nome) || null;
  }

  private timeImagemRows(): Array<{
    pessoa: string;
    categoria: string;
    consultoria: string;
    perfis: string;
    situacao: string;
    temReal: boolean;
    temRascunho: boolean;
    valoresMes: number[];
    totalValor: number;
    totalHoras: number;
  }> {
    const lo = this.loSelecionada();
    if (!lo) return [];
    const map = new Map<string, {
      pessoa: string;
      categoria: string;
      consultoria: string;
      perfis: Set<string>;
      temReal: boolean;
      temRascunho: boolean;
      valoresMes: number[];
      totalHoras: number;
    }>();

    this.alocacoes
      .filter((a: any) => a.linhaOrcamentariaId === lo.id)
      .forEach((a: any) => {
        const pessoaNome = String(a.nomePessoa || '-').trim() || '-';
        const pessoa = this.pessoaPorNome(pessoaNome);
        const key = this.normalized(pessoaNome);
        const row = map.get(key) ?? {
          pessoa: pessoaNome,
          categoria: this.getCategoriaDaPessoa(a),
          consultoria: pessoa?.consultoria || '',
          perfis: new Set<string>(),
          temReal: false,
          temRascunho: false,
          valoresMes: Array(12).fill(0),
          totalHoras: 0,
        };
        row.perfis.add(a.perfilNome || '-');
        row.temReal = row.temReal || !a.draft;
        row.temRascunho = row.temRascunho || !!a.draft;
        const valorHora = this.getValorHoraDaAlocacao(a);
        for (let month = 0; month < 12; month++) {
          const valor = this.round2(this.custoMensal(a.id, valorHora, month));
          const horas = this.horasMensaisExportacao(a, month);
          row.valoresMes[month] = this.round2(row.valoresMes[month] + valor);
          row.totalHoras = this.round2(row.totalHoras + horas);
        }
        map.set(key, row);
      });

    return [...map.values()]
      .map(row => ({
        pessoa: row.pessoa,
        categoria: row.categoria,
        consultoria: row.consultoria,
        perfis: [...row.perfis].join(', '),
        situacao: row.temReal && row.temRascunho ? 'Real + rascunho' : row.temRascunho ? 'Rascunho' : 'Real',
        temReal: row.temReal,
        temRascunho: row.temRascunho,
        valoresMes: row.valoresMes,
        totalValor: this.round2(row.valoresMes.reduce((sum, value) => sum + value, 0)),
        totalHoras: row.totalHoras,
      }))
      .sort((a, b) => b.totalValor - a.totalValor || a.pessoa.localeCompare(b.pessoa, 'pt-BR', { sensitivity: 'base' }));
  }

  private horasMensaisExportacao(a: any, month: number): number {
    if (this.isCancelado(a.id, month) || this.mesIndisponivelParaAlocacao(a.id, month)) return 0;
    const horas = this.horasEfetivas(month, this.getCategoriaDaPessoa(a), a.nomePessoa || '', !!a.draft);
    return this.round2(horas * Number(this.getPercentualEfetivoMes(a.id, month) || 0) / 100);
  }

  private statusMensalExportacao(allocationId: string, month: number): string {
    if (this.isCancelado(allocationId, month)) return 'Cancelado';
    if (this.mesIndisponivelParaAlocacao(allocationId, month)) return this.motivoMesIndisponivelAlocacao(allocationId, month);
    if (this.isPago(allocationId, month)) return 'Pago';
    if ((this.getValorMensalManual(allocationId, month) ?? 0) > 0) return 'Valor manual';
    if (this.isPercentualMesSobrescrito(allocationId, month)) return 'Percentual manual';
    return this.getPercentualEfetivoMes(allocationId, month) > 0 ? 'Ativo' : '-';
  }

  private timeResumoCols(colCount: number): any[] {
    return Array.from({ length: colCount }, (_v, index) => {
      if (index === 0) return { wch: 28 };
      if (index >= 9 && index <= 21) return { wch: 13 };
      if (index >= 22) return { wch: 11 };
      return { wch: 16 };
    });
  }

  private timeDetalheCols(colCount: number): any[] {
    return Array.from({ length: colCount }, (_v, index) => {
      if (index <= 3) return { wch: 24 };
      if (index >= 11 && (index - 11) % 4 === 3) return { wch: 18 };
      return { wch: 12 };
    });
  }

  private safeFilePart(value: string): string {
    return String(value || 'export')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'export';
  }

  private fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();
  }

  private drawMetricCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, label: string, value: string, color: string) {
    this.fillRoundRect(ctx, x, y, width, height, 22, '#ffffff');
    this.fillRoundRect(ctx, x, y, 8, height, 4, color);
    ctx.fillStyle = '#64748b';
    ctx.font = '700 15px Inter, Arial, sans-serif';
    ctx.fillText(label.toUpperCase(), x + 24, y + 34);
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 31px Inter, Arial, sans-serif';
    this.drawTextFit(ctx, value, x + 24, y + 76, width - 42);
  }

  private drawTextFit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
    const raw = String(text || '-');
    if (ctx.measureText(raw).width <= maxWidth) {
      ctx.fillText(raw, x, y);
      return;
    }
    let next = raw;
    while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) {
      next = next.slice(0, -1);
    }
    ctx.fillText(`${next}…`, x, y);
  }

  private initials(value: string): string {
    const parts = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] || '?').slice(0, 2)).toUpperCase();
  }

  private formatCompactCurrency(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')} mi`;
    if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`;
    return this.currency(value);
  }

  private formatCompactNumber(value: number): string {
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1).replace('.', ',')}k`;
    return String(Math.round(value));
  }

  private num(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }

  private applyExcelStyle(ws: any, colCount: number) {
    if (!ws['!cols']) ws['!cols'] = [];

    for (let i = 0; i < colCount; i++) {
      ws['!cols'][i] = { wch: i < 5 ? 22 : 14 };
    }
  }

  // ── Ordenação personalizada (drag-and-drop) ────────────────────────────────

  temOrdemCustom(): boolean {
    return !!(this.ordemPorLo[this.loSelecionadaId]?.length);
  }

  resetarOrdemCustom() {
    if (this.loSelecionadaId) {
      delete this.ordemPorLo[this.loSelecionadaId];
      try { localStorage.removeItem(this.ordemLoKey(this.loSelecionadaId)); } catch {}
    }
    this.sortColuna = null;
    this.sortDirecao = 'asc';
  }

  confirmToast: { msg: string; onConfirm: () => void } | null = null;

  private showConfirmToast(msg: string, onConfirm: () => void) {
    this.confirmToast = { msg, onConfirm };
  }

  confirmToastAction(confirmed: boolean) {
    const pending = this.confirmToast;
    this.confirmToast = null;
    if (confirmed && pending) pending.onConfirm();
  }

  ordenarPor(coluna: string) {
    if (this.temOrdemCustom()) {
      this.showConfirmToast('Ordenar pela coluna vai perder sua ordenação personalizada. Continuar?', () => {
        this.resetarOrdemCustom();
        this._aplicarOrdenacao(coluna);
      });
      return;
    }
    this._aplicarOrdenacao(coluna);
  }

  private _aplicarOrdenacao(coluna: string) {
    if (this.sortColuna === coluna) {
      this.sortDirecao = this.sortDirecao === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColuna = coluna;
      this.sortDirecao = 'asc';
    }
  }

  getSortIcon(coluna: string): string {
    if (this.sortColuna !== coluna) return '\u2195';
    return this.sortDirecao === 'asc' ? '\u2191' : '\u2193';
  }

  private compararPorColuna(a: any, b: any): number {
    const mult = this.sortDirecao === 'asc' ? 1 : -1;
    switch (this.sortColuna) {
      case 'nome':
        return mult * String(a?.nomePessoa || '').localeCompare(String(b?.nomePessoa || ''), 'pt-BR');
      case 'categoria': {
        const ca = this.getCategoriaDaPessoa(a);
        const cb = this.getCategoriaDaPessoa(b);
        return mult * ca.localeCompare(cb);
      }
      case 'pct':
        return mult * (Number(this.getConfig(a.id).percentual) - Number(this.getConfig(b.id).percentual));
      case 'valorH':
        return mult * (this.getValorHoraDaAlocacao(a) - this.getValorHoraDaAlocacao(b));
      case 'total': {
        const ta = this.meses.reduce((s: number, _: string, mi: number) => s + this.custoMensal(a.id, this.getValorHoraDaAlocacao(a), mi), 0);
        const tb = this.meses.reduce((s: number, _: string, mi: number) => s + this.custoMensal(b.id, this.getValorHoraDaAlocacao(b), mi), 0);
        return mult * (ta - tb);
      }
      default: return 0;
    }
  }

  onDragStart(idx: number, event: DragEvent) {
    if (this.searchTerm.trim() || this.editingId) { event.preventDefault(); return; }
    this.dragSourceIndex = idx;
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.startDragAutoScrollLoop();
  }

  onDragOver(event: DragEvent, idx: number) {
    event.preventDefault();
    if (this.dragSourceIndex == null) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIndex = idx;
    this.dragPointerX = event.clientX;
    this.dragPointerY = event.clientY;
    this.autoScrollTableWhileDragging(event);
    this.autoScrollTableByRowPosition(event);
  }

  onTableDragOver(event: DragEvent) {
    if (this.dragSourceIndex == null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragPointerX = event.clientX;
    this.dragPointerY = event.clientY;
    this.autoScrollTableWhileDragging(event);
  }

  onDragLeave() {
    this.dragOverIndex = null;
  }

  onDragEnd() {
    this.dragSourceIndex = null;
    this.dragOverIndex = null;
    this.stopDragAutoScrollLoop();
  }

  onDrop(event: DragEvent, idx: number) {
    event.preventDefault();
    if (this.dragSourceIndex == null || this.dragSourceIndex === idx) {
      this.onDragEnd();
      return;
    }
    const allocs = this.alocacoesFiltradas();
    const ids = allocs.map((a: any) => a.id);
    const [moved] = ids.splice(this.dragSourceIndex, 1);
    ids.splice(idx, 0, moved);
    this.ordemPorLo[this.loSelecionadaId] = ids;
    this.salvarOrdemLo(this.loSelecionadaId, ids);
    this.sortColuna = null;
    this.onDragEnd();
  }

  private autoScrollTableWhileDragging(event: DragEvent) {
    const wrap = this.tableWrapRef?.nativeElement;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    const topDist = y - rect.top;
    const bottomDist = rect.bottom - y;
    const leftDist = x - rect.left;
    const rightDist = rect.right - x;

    if (y < rect.top) {
      wrap.scrollTop -= this.dragAutoScrollMaxStep;
    } else if (y > rect.bottom) {
      wrap.scrollTop += this.dragAutoScrollMaxStep;
    } else if (topDist >= 0 && topDist < this.dragAutoScrollEdge) {
      const ratio = (this.dragAutoScrollEdge - topDist) / this.dragAutoScrollEdge;
      const step = Math.max(1, Math.round(this.dragAutoScrollMaxStep * ratio * ratio));
      wrap.scrollTop -= step;
    } else if (bottomDist >= 0 && bottomDist < this.dragAutoScrollEdge) {
      const ratio = (this.dragAutoScrollEdge - bottomDist) / this.dragAutoScrollEdge;
      const step = Math.max(1, Math.round(this.dragAutoScrollMaxStep * ratio * ratio));
      wrap.scrollTop += step;
    }

    if (x < rect.left) {
      wrap.scrollLeft -= this.dragAutoScrollMaxStep;
    } else if (x > rect.right) {
      wrap.scrollLeft += this.dragAutoScrollMaxStep;
    } else if (leftDist >= 0 && leftDist < this.dragAutoScrollEdge) {
      const ratio = (this.dragAutoScrollEdge - leftDist) / this.dragAutoScrollEdge;
      const step = Math.max(1, Math.round(this.dragAutoScrollMaxStep * ratio * ratio));
      wrap.scrollLeft -= step;
    } else if (rightDist >= 0 && rightDist < this.dragAutoScrollEdge) {
      const ratio = (this.dragAutoScrollEdge - rightDist) / this.dragAutoScrollEdge;
      const step = Math.max(1, Math.round(this.dragAutoScrollMaxStep * ratio * ratio));
      wrap.scrollLeft += step;
    }
  }

  private autoScrollTableByRowPosition(event: DragEvent) {
    const wrap = this.tableWrapRef?.nativeElement;
    const row = event.currentTarget as HTMLElement | null;
    if (!wrap || !row) return;
    const wrapRect = wrap.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const edge = 44;
    const step = Math.max(8, Math.round(this.dragAutoScrollMaxStep * 0.8));

    if (rowRect.bottom > (wrapRect.bottom - edge)) {
      wrap.scrollTop += step;
    } else if (rowRect.top < (wrapRect.top + edge)) {
      wrap.scrollTop -= step;
    }
  }

  private startDragAutoScrollLoop() {
    this.stopDragAutoScrollLoop();
    const tick = () => {
      if (this.dragSourceIndex == null) {
        this.dragAutoScrollRaf = null;
        return;
      }
      const wrap = this.tableWrapRef?.nativeElement;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const x = this.dragPointerX;
        const y = this.dragPointerY;
        const viewportBottomEdge = window.innerHeight - this.dragViewportEdge;
        const viewportTopEdge = this.dragViewportEdge;

        const topDist = y - rect.top;
        const bottomDist = rect.bottom - y;
        const leftDist = x - rect.left;
        const rightDist = rect.right - x;

        if (y >= viewportBottomEdge) {
          wrap.scrollTop += this.dragAutoScrollMaxStep;
        } else if (y <= viewportTopEdge) {
          wrap.scrollTop -= this.dragAutoScrollMaxStep;
        } else if (y < rect.top) {
          wrap.scrollTop -= this.dragAutoScrollMaxStep;
        } else if (y > rect.bottom) {
          wrap.scrollTop += this.dragAutoScrollMaxStep;
        } else if (topDist >= 0 && topDist < this.dragAutoScrollEdge) {
          const ratio = (this.dragAutoScrollEdge - topDist) / this.dragAutoScrollEdge;
          const step = Math.max(1, Math.round(this.dragAutoScrollMaxStep * ratio * ratio));
          wrap.scrollTop -= step;
        } else if (bottomDist >= 0 && bottomDist < this.dragAutoScrollEdge) {
          const ratio = (this.dragAutoScrollEdge - bottomDist) / this.dragAutoScrollEdge;
          const step = Math.max(1, Math.round(this.dragAutoScrollMaxStep * ratio * ratio));
          wrap.scrollTop += step;
        }

        if (x < rect.left) {
          wrap.scrollLeft -= this.dragAutoScrollMaxStep;
        } else if (x > rect.right) {
          wrap.scrollLeft += this.dragAutoScrollMaxStep;
        } else if (leftDist >= 0 && leftDist < this.dragAutoScrollEdge) {
          const ratio = (this.dragAutoScrollEdge - leftDist) / this.dragAutoScrollEdge;
          const step = Math.max(1, Math.round(this.dragAutoScrollMaxStep * ratio * ratio));
          wrap.scrollLeft -= step;
        } else if (rightDist >= 0 && rightDist < this.dragAutoScrollEdge) {
          const ratio = (this.dragAutoScrollEdge - rightDist) / this.dragAutoScrollEdge;
          const step = Math.max(1, Math.round(this.dragAutoScrollMaxStep * ratio * ratio));
          wrap.scrollLeft += step;
        }
      }
      this.dragAutoScrollRaf = requestAnimationFrame(tick);
    };
    this.dragAutoScrollRaf = requestAnimationFrame(tick);
  }

  private stopDragAutoScrollLoop() {
    if (this.dragAutoScrollRaf != null) {
      cancelAnimationFrame(this.dragAutoScrollRaf);
      this.dragAutoScrollRaf = null;
    }
  }

  private startPanLoop() {
    this.stopPanLoop();
    const wrap = this.tableWrapRef?.nativeElement;
    if (!wrap) return;
    const tick = () => {
      if (!this.dragScrolling) {
        this.panRaf = null;
        return;
      }
      if (this.panDeltaX !== 0 || this.panDeltaY !== 0) {
        wrap.scrollLeft -= this.panDeltaX * this.dragScrollSpeed;
        wrap.scrollTop -= this.panDeltaY * this.dragScrollSpeed;
        this.panDeltaX = 0;
        this.panDeltaY = 0;
      }
      this.panRaf = requestAnimationFrame(tick);
    };
    this.panRaf = requestAnimationFrame(tick);
  }

  private stopPanLoop() {
    if (this.panRaf != null) {
      cancelAnimationFrame(this.panRaf);
      this.panRaf = null;
    }
    this.panDeltaX = 0;
    this.panDeltaY = 0;
  }

  private ordemLoKey(loId: string): string {
    return `planner_lo_custom_order_${loId}`;
  }

  private salvarOrdemLo(loId: string, ids: string[]) {
    try { localStorage.setItem(this.ordemLoKey(loId), JSON.stringify(ids)); } catch {}
  }

  private carregarOrdemLo(loId: string): string[] {
    try {
      const raw = localStorage.getItem(this.ordemLoKey(loId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

}
