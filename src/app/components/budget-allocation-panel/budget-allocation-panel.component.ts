import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlannerApiService } from '../../core/planner-api.service';

@Component({
  selector: 'app-budget-allocation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  @Input() token = '';
  @Output() create = new EventEmitter<{ linhaOrcamentariaId: string; nomePessoa: string; perfilId: string; horasPlanejadas: number; draft?: boolean; mesInicio?: number }>();
  @Output() update = new EventEmitter<{ id: string; linhaOrcamentariaId: string; nomePessoa: string; perfilId: string; horasPlanejadas: number; draft?: boolean; mesInicio?: number }>();
  @Output() remove = new EventEmitter<string>();
  @Output() createPerson = new EventEmitter<{ nome: string; perfilId: string; tipoVinculo: string; consultoria: string; valorHora: number | null; valorMensal: number | null; vagaUrl: string }>();
  form = { linhaOrcamentariaId: '', nomePessoa: '', perfilId: '', horasPlanejadas: 0 };
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
  colunasFixasAteMes(): number {
    let n = 1; // Pessoa
    if (this.col('vaga')) n++;
    if (this.col('perfil')) n++;
    if (this.col('categoria')) n++;
    if (this.col('pct')) n++;
    if (this.col('valorH')) n++;
    return n;
  }
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
    if (!q) return this.linhasDoAnoSelecionado();
    return this.linhasDoAnoSelecionado().filter((lo: any) =>
      (lo.codigo || '').toLowerCase().includes(q) ||
      (lo.nome || '').toLowerCase().includes(q) ||
      (lo.tipo || '').toLowerCase().includes(q)
    );
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
    return this.linhasDoAnoSelecionado().reduce((acc: number, lo: any) => {
      const base = Number(lo?.valorTotal || 0);
      const delta = this.ajustes
        .filter((a: any) => a.budgetLineId === lo.id)
        .reduce((sum: number, a: any) => {
          const valor = Number(a?.valor || 0);
          return sum + (String(a?.tipo || '').toUpperCase() === 'APORTE' ? valor : -valor);
        }, 0);
      return acc + base + delta;
    }, 0);
  }

  
  valorMaximoMes(a: any, monthIndex: number): number {
    const vh = this.getValorHoraDaAlocacao(a);
    if (!vh) return 0;
    const pct = this.percentualDisponivelParaLinha(a.id, monthIndex);
    const horas = this.horasEfetivas(monthIndex, this.getCategoriaDaPessoa(a));
    return this.round2(vh * horas * pct / 100);
  }

  
  pessoaSemCustoLo(a: any): boolean {
    return this.getValorHoraDaAlocacao(a) === 0;
  }

  
  novaPessoaSemCustoLo(): boolean {
    return !!this.normalized(this.form.nomePessoa) && this.valorHoraPessoaSelecionadaNova() === 0;
  }

  getValorHoraDaAlocacao(a: any): number {
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
    const idsAno = new Set(this.linhasDoAnoSelecionado().map((lo: any) => lo.id));
    return this.alocacoes
      .filter((a: any) => idsAno.has(a.linhaOrcamentariaId))
      .filter((a: any) => this.alocacaoContaNoGeral(a))
      .reduce((acc: number, a: any) => {
      const vh = this.getValorHoraDaAlocacao(a);
      const anual = this.meses.reduce(
        (sum: number, _m: string, monthIndex: number) => sum + this.custoMensal(a.id, vh, monthIndex),
        0
      );
      return acc + anual;
      }, 0);
  }

  saldoGeralLos(): number {
    return this.totalOrcamentoGeralLos() - this.totalComprometidoGeralLos();
  }

  saldoAtualGeralLos(): number {
    return this.totalOrcamentoGeralLos() - this.totalPagoGeralLos();
  }

  percentualUtilizadoGeral(): number {
    const orc = this.totalOrcamentoGeralLos();
    if (!orc) return 0;
    return (this.totalComprometidoGeralLos() / orc) * 100;
  }

  numLosAno(): number {
    return this.linhasDoAnoSelecionado().length;
  }

  numAlocacoesAno(): number {
    const idsAno = new Set(this.linhasDoAnoSelecionado().map((lo: any) => lo.id));
    return this.alocacoes
      .filter((a: any) => idsAno.has(a.linhaOrcamentariaId))
      .filter((a: any) => this.alocacaoContaNoGeral(a))
      .length;
  }

  numPessoasAlocadasAno(): number {
    const idsAno = new Set(this.linhasDoAnoSelecionado().map((lo: any) => lo.id));
    const nomes = new Set(
      this.alocacoes
        .filter((a: any) => idsAno.has(a.linhaOrcamentariaId))
        .filter((a: any) => this.alocacaoContaNoGeral(a))
        .map((a: any) => this.normalized(a?.nomePessoa || ''))
        .filter((n: string) => !!n)
    );
    return nomes.size;
  }

  mediaComprometidoPorLo(): number {
    const n = this.numLosAno();
    if (!n) return 0;
    return this.totalComprometidoGeralLos() / n;
  }

  clampPct(v: number): number {
    return Math.max(0, Math.min(100, v));
  }

  totalPagoGeralLos(): number {
    const idsAno = new Set(this.linhasDoAnoSelecionado().map((lo: any) => lo.id));
    return this.alocacoes
      .filter((a: any) => idsAno.has(a.linhaOrcamentariaId))
      .filter((a: any) => this.alocacaoContaNoGeral(a))
      .reduce((acc: number, a: any) => {
        const vh = this.getValorHoraDaAlocacao(a);
        const pagoAnual = this.meses.reduce((sum: number, _: string, mi: number) => {
          if (!this.isPago(a.id, mi)) return sum;
          return sum + this.custoMensal(a.id, vh, mi);
        }, 0);
        return acc + pagoAnual;
      }, 0);
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
    const horas = this.horasEfetivas(mi, this.categoriaDaAlocacaoId(allocationId));
    return (valorHora || 0) * horas * (percentual / 100);
  }

  totalComprometidoMesLo(month: number): number {
    if (month < 0 || month > 11) return 0;
    return this.alocacoesFiltradas()
      .filter((a: any) => this.alocacaoContaNoResumoLo(a))
      .reduce((acc: number, a: any) => {
      return acc + this.custoMensal(a.id, this.getValorHoraDaAlocacao(a), month);
      }, 0);
  }

  totalComprometidoMesPorCategoria(month: number, categoria: 'FOLHA' | 'TERCEIRO'): number {
    if (month < 0 || month > 11) return 0;
    return this.alocacoesFiltradas()
      .filter((a: any) => this.alocacaoContaNoResumoLo(a))
      .filter((a: any) => this.getCategoriaDaPessoa(a) === categoria)
      .reduce((acc: number, a: any) => acc + this.custoMensal(a.id, this.getValorHoraDaAlocacao(a), month), 0);
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

  
  private horasEfetivas(monthIndex: number, categoria?: 'FOLHA' | 'TERCEIRO', nomePessoa?: string): number {
    const base = this.horasDoCadastro(monthIndex);
    if (categoria !== 'TERCEIRO' || !nomePessoa) return base;
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
      horasPlanejadas: Number(a.horasPlanejadas)
    };
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
    this.update.emit({ id: this.editingId, ...this.form, horasPlanejadas: this.horasMesAtual() });
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

  adicionarAlocacao() {
    const nomePessoa = this.form.nomePessoa || '';

    if (!this.draftMode) {
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

    if (this.normalized(nomePessoa) && this.loSelecionadaId && !this.draftMode) {
      const pendingKey = this.pendingPctKey(nomePessoa, this.loSelecionadaId);
      localStorage.setItem(pendingKey, String(this.novaAlocacaoPercentual));
    }

    const payload: any = { ...this.form, horasPlanejadas: this.horasMesAtual() };
    if (this.draftMode) payload.draft = true;
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
  }

  fecharNovaLinha() {
    this.novaLinhaAberta = false;
    this.novaPessoaSelecionadaId = '';
    this.pessoaNovaNome = '';
    this.form.nomePessoa = '';
    this.form.perfilId = '';
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
    const pessoa = this.pessoas.find((p: any) => p.id === this.pessoaEdicaoSelecionadaId);
    if (pessoa?.valorHora != null) return Number(pessoa.valorHora);
    if (pessoa?.perfilId) {
      const perfil = this.perfis.find((x: any) => x.id === pessoa.perfilId);
      if (perfil?.valorHora != null) return Number(perfil.valorHora);
    }
    return 0;
  }

  custoMensalNovaPessoa(monthIndex: number): number {
    if (this.mesIndisponivelNovaPessoa(monthIndex)) return 0;
    const valorHora = this.valorHoraPessoaSelecionadaNova();
    const percentual = Number(this.novaAlocacaoPercentual || 0) / 100;
    const horas = this.horasEfetivas(monthIndex, this.categoriaNovaAlocacao(), this.form.nomePessoa || '');
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
    const horas = this.horasEfetivas(month, this.categoriaNovaAlocacao(), this.form.nomePessoa || '');
    return this.round2(valorHora * horas * pctEfetivo / 100);
  }

  custoMensalEdicaoPessoa(allocationId: string, monthIndex: number): number {
    if (this.isCancelado(allocationId, monthIndex)) return 0;
    if (this.mesIndisponivelParaAlocacao(allocationId, monthIndex)) return 0;
    const valorHora = this.valorHoraPessoaSelecionadaEdicao();
    const percentual = Number(this.getConfig(allocationId).percentual || 0) / 100;
    const horas = this.horasEfetivas(monthIndex, this.categoriaDaAlocacaoId(allocationId), this.nomePessoaDaAlocacao(allocationId));
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
    } else {
      this.selecionarPessoaNova('');
    }
  }

  onPessoaEdicaoNomeChange(nome: string) {
    this.pessoaEdicaoNome = nome;
    const pessoa = this.pessoas.find(
      (p: any) => this.normalized(p?.nome || '') === this.normalized(nome)
    );
    if (pessoa) {
      this.selecionarPessoaEdicao(pessoa.id);
    } else {
      this.selecionarPessoaEdicao('');
    }
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
        return sum + this.custoMensal(a.id, vh, mi);
      }, 0);
      }, 0);
  }

  private alocacaoContaNoResumoLo(a: any): boolean {
    if (this.isPessoaPlaneada(a)) return this.incluirRascunhoNosTotalizadores || this.isPlanejadaAtivaNosTotal(a.id);
    if (a?.draft) return this.incluirRascunhoNosTotalizadores;
    return true;
  }

  private alocacaoContaNoGeral(a: any): boolean {
    if (this.isPessoaPlaneada(a)) return false;
    if (a?.draft) return false;
    return true;
  }

  onToggleIncluirRascunhoNosTotalizadores() {
    this.percentualAviso = '';
  }

  private preencherPessoaNoForm(pessoaId: string) {
    const pessoa = this.pessoas.find((p: any) => p.id === pessoaId);
    if (!pessoa) return;
    this.form.nomePessoa = pessoa.nome || '';
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
      const horas = this.horasEfetivas(month, this.categoriaDaAlocacaoId(allocationId), this.nomePessoaDaAlocacao(allocationId));
      const aloc = this.alocacoes.find((a: any) => a.id === allocationId);
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
    const horas = this.horasEfetivas(month, this.categoriaDaAlocacaoId(allocationId), this.nomePessoaDaAlocacao(allocationId));
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

      
      const dt = new Date();
      const fileName = `alocacoes_${this.anoSelecionado}_${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    });
  }

  private num(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }

  private applyExcelStyle(ws: any, colCount: number) {
    if (!ws['!cols']) ws['!cols'] = [];

    for (let i = 0; i < colCount; i++) {
      ws['!cols'][i] = { wch: i < 5 ? 22 : 14 };
    }
  }

  // â”€â”€ Ordenação personalizada (drag-and-drop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    if (this.sortColuna !== coluna) return 'â†•';
    return this.sortDirecao === 'asc' ? 'â†‘' : 'â†“';
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

