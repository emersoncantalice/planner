import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';

@Component({
  selector: 'app-indicators-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './indicators-panel.component.html',
  styleUrl: './indicators-panel.component.scss'
})
export class IndicatorsPanelComponent {
  @Input() indicadores: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() isAdmin = false;
  @Output() create        = new EventEmitter<any>();
  @Output() update        = new EventEmitter<any>();
  @Output() remove        = new EventEmitter<string>();
  @Output() addCycle      = new EventEmitter<{ indicatorId: string; payload: any }>();
  @Output() updateCycle   = new EventEmitter<{ indicatorId: string; cycleId: string; payload: any }>();
  @Output() removeCycle   = new EventEmitter<{ indicatorId: string; cycleId: string }>();
  @Output() addAction     = new EventEmitter<{ indicatorId: string; payload: any }>();
  @Output() updateAction  = new EventEmitter<{ indicatorId: string; actionId: string; payload: any }>();
  @Output() removeAction  = new EventEmitter<{ indicatorId: string; actionId: string }>();
  @Input()  currentUser = '';
  @Output() transferOwnership = new EventEmitter<{ id: string; novoDono: string }>();

  transferId    = '';
  transferInput = '';

  isDono(item: any): boolean {
    const role = (localStorage.getItem('planner_role') || '').trim();
    if (role === 'ADMIN' || this.isAdmin) return true;
    if (!item?.criadoPor) return true;
    return item.criadoPor.toLowerCase() === (this.currentUser || '').toLowerCase();
  }
  iniciarTransferencia(id: string) { this.transferId = id; this.transferInput = ''; }
  cancelarTransferencia()           { this.transferId = ''; this.transferInput = ''; }
  confirmarTransferencia()          {
    if (!this.transferInput.trim()) return;
    this.transferOwnership.emit({ id: this.transferId, novoDono: this.transferInput.trim() });
    this.cancelarTransferencia();
  }

  usuariosTransferenciaFiltrados(): string[] {
    const nomes = this.pessoasAtivas()
      .map((p: any) => String(p?.nome || '').trim())
      .filter(Boolean);
    const base = Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const q = this.transferInput.trim().toLowerCase();
    if (!q) return base;
    return base.filter(n => n.toLowerCase().includes(q));
  }

  // â”€â”€ view state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  selectedId    = '';
  searchTerm    = '';
  filterTipo    = '';   // '' | 'TECNICO' | 'NEGOCIO'
  filterStatus  = '';   // '' | 'ATIVO' | 'INATIVO'
  detailTab: 'ciclos' | 'acoes' = 'ciclos';

  // modals
  formOpen      = false;
  editingId     = '';
  cycleModalId  = '';   // single-indicator new cycle
  batchOpen     = false;
  actionModalId = '';   // nova ação
  editingActionId = '';
  // cycle edit modal (admin only)
  cycleEditModalIndId = '';
  cycleEditModalCicloId = '';
  cycleEditForm: { valor: string; observacao: string; dataReferencia: string } = { valor: '', observacao: '', dataReferencia: '' };

  // forms
  indForm = this.emptyIndForm();
  cycleForm: { valor: string; observacao: string; dataReferencia: string; acoesConcluidasIds: string[] } = this.emptyCycleForm();
  actionForm: { descricao: string; responsavel: string; prazo: string } = this.emptyActionForm();

  // batch: one entry per active indicator
  batchEntries: Array<{
    id: string;
    titulo: string;
    valorAtual: number | null;
    unidade: string;
    meta: number | null;
    novoValor: string;
    observacao: string;
    dataReferencia: string;
    acoesExpanded: boolean;
    acoes: any[];
    acoesConcluidasIds: string[];
  }> = [];

  // â”€â”€ enums â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  readonly tipos = [
    { value: 'TECNICO',  label: 'Técnico' },
    { value: 'NEGOCIO',  label: 'Negócio' },
  ];

  readonly categorias = [
    { value: 'QUALIDADE',     label: 'Qualidade' },
    { value: 'PRODUTIVIDADE', label: 'Produtividade' },
    { value: 'FINANCEIRO',    label: 'Financeiro' },
    { value: 'ATENDIMENTO',   label: 'Atendimento' },
    { value: 'SEGURANCA',     label: 'Segurança' },
    { value: 'OUTROS',        label: 'Outros' },
  ];

  readonly polaridades = [
    { value: 'MAIOR_MELHOR', label: 'Maior = Melhor (↑ bom)' },
    { value: 'MENOR_MELHOR', label: 'Menor = Melhor (↓ bom)' },
  ];

  readonly frequencias = [
    { value: 'SEMANAL',     label: 'Semanal' },
    { value: 'QUINZENAL',   label: 'Quinzenal' },
    { value: 'MENSAL',      label: 'Mensal' },
    { value: 'TRIMESTRAL',  label: 'Trimestral' },
  ];

  readonly statusOpts = [
    { value: 'ATIVO',   label: 'Ativo' },
    { value: 'INATIVO', label: 'Inativo' },
  ];

  readonly actionStatusOpts = [
    { value: 'ABERTA',    label: 'Aberta' },
    { value: 'CONCLUIDA', label: 'Concluída' },
  ];

  pessoasAtivas() {
    return this.pessoas.filter((p: any) => p.ativo !== false);
  }

  /** Data de hoje no formato YYYY-MM-DD — usado como [max] nos inputs de data */
  get today(): string {
    return new Date().toISOString().split('T')[0];
  }

  /** Verifica se um campo numérico tem valor (pode ser número ou string vazia) */
  private hasVal(v: string | number | null | undefined): boolean {
    return v !== '' && v != null;
  }

  // â”€â”€ filter/list helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  filtered(): any[] {
    const q = this.searchTerm.trim().toLowerCase();
    return this.indicadores.filter(ind => {
      if (this.filterTipo   && ind.tipo   !== this.filterTipo)   return false;
      if (this.filterStatus && ind.status !== this.filterStatus) return false;
      if (q && !`${ind.titulo} ${ind.descricao} ${ind.responsavel} ${ind.categoria}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  selectedInd(): any | null {
    if (!this.selectedId) return null;
    return this.indicadores.find(i => i.id === this.selectedId) ?? null;
  }

  selectCard(id: string) {
    this.selectedId = this.selectedId === id ? '' : id;
    this.detailTab = 'ciclos';
  }

  // â”€â”€ computed helpers per indicator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  valorAtual(ind: any): number | null {
    const ciclos = (ind.ciclos ?? []) as any[];
    if (!ciclos.length) return null;
    return ciclos[ciclos.length - 1].valor ?? null;
  }

  tendencia(ind: any): 'up' | 'down' | 'stable' {
    const ciclos = ((ind.ciclos ?? []) as any[]).filter((c: any) => c.valor != null);
    if (ciclos.length < 2) return 'stable';
    const last = Number(ciclos[ciclos.length - 1].valor);
    const prev = Number(ciclos[ciclos.length - 2].valor);
    if (last > prev * 1.001) return 'up';
    if (last < prev * 0.999) return 'down';
    return 'stable';
  }

  isGoodTrend(ind: any): boolean {
    const t = this.tendencia(ind);
    if (t === 'stable') return true;
    return ind.polaridade === 'MAIOR_MELHOR' ? t === 'up' : t === 'down';
  }

  metaAtingida(ind: any): boolean {
    const val = this.valorAtual(ind);
    if (val == null || ind.meta == null) return false;
    return ind.polaridade === 'MAIOR_MELHOR' ? val >= ind.meta : val <= ind.meta;
  }

  pctMeta(ind: any): number {
    const val = this.valorAtual(ind);
    if (val == null || !ind.meta) return 0;
    if (ind.polaridade === 'MAIOR_MELHOR') return Math.min(100, Math.round((val / ind.meta) * 100));
    // menor melhor: meta is "max acceptable", 100% = val <= meta
    if (val <= ind.meta) return 100;
    return Math.max(0, Math.round((ind.meta / val) * 100));
  }

  acoesAbertas(ind: any): any[] {
    return ((ind.acoes ?? []) as any[]).filter((a: any) => a.status === 'ABERTA');
  }

  acoesConcluidasInd(ind: any): any[] {
    return ((ind.acoes ?? []) as any[]).filter((a: any) => a.status === 'CONCLUIDA');
  }

  sparklinePoints(ind: any): string {
    const ciclos = (ind.ciclos ?? []) as any[];
    if (ciclos.length < 2) return '';
    const vals = ciclos.map((c: any) => Number(c.valor ?? 0));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const W = 80, H = 28;
    return vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  sparklineColor(ind: any): string {
    if (!this.metaAtingida(ind)) return '#f59e0b';
    return this.isGoodTrend(ind) ? '#22c55e' : '#ef4444';
  }

  cardStatusClass(ind: any): string {
    if (ind.status === 'INATIVO') return 'ind-card-inativo';
    if (this.metaAtingida(ind)) return 'ind-card-ok';
    const pct = this.pctMeta(ind);
    if (pct >= 80) return 'ind-card-perto';
    return 'ind-card-abaixo';
  }

  // â”€â”€ indicator CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  openCreate() {
    this.editingId = '';
    this.indForm = this.emptyIndForm();
    this.formOpen = true;
  }

  openEdit(ind: any) {
    this.editingId = ind.id;
    this.indForm = {
      titulo:              ind.titulo ?? '',
      descricao:           ind.descricao ?? '',
      tipo:                this.normalizeTipo(ind.tipo),
      categoria:           ind.categoria ?? 'QUALIDADE',
      unidade:             ind.unidade ?? '',
      meta:                ind.meta != null ? String(ind.meta) : '',
      polaridade:          ind.polaridade ?? 'MAIOR_MELHOR',
      frequencia:          ind.frequencia ?? 'MENSAL',
      responsavel:         ind.responsavel ?? '',
      status:              ind.status ?? 'ATIVO',
      valorInicial:        '',   // não aplicável na edição
      novoValor:           '',
      novaDataReferencia:  '',
    };
    this.formOpen = true;
  }

  cancelForm() {
    this.formOpen = false;
    this.editingId = '';
    this.indForm = this.emptyIndForm();
  }

  submitForm() {
    const { valorInicial, novoValor, novaDataReferencia, ...rest } = this.indForm;
    const payload = {
      ...rest,
      tipo: this.normalizeTipo(rest.tipo),
      meta: rest.meta !== '' ? Number(rest.meta) : null,
    };
    if (this.editingId) {
      this.update.emit({ id: this.editingId, ...payload });
      if (novoValor !== '') {
        this.addCycle.emit({
          indicatorId: this.editingId,
          payload: {
            valor: Number(novoValor),
            observacao: null,
            dataReferencia: novaDataReferencia ? `${novaDataReferencia}T00:00:00Z` : null,
            acoesConcluidasIds: [],
          },
        });
      }
    } else {
      this.create.emit({ ...payload, valorInicial: valorInicial !== '' ? Number(valorInicial) : null });
    }
    this.cancelForm();
  }

  excluir(id: string) {
    if (this.selectedId === id) this.selectedId = '';
    this.remove.emit(id);
  }

  // â”€â”€ single cycle modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  openCycleModal(ind: any) {
    this.cycleModalId = ind.id;
    this.cycleForm = this.emptyCycleForm();
  }

  closeCycleModal() {
    this.cycleModalId = '';
    this.cycleForm = this.emptyCycleForm();
  }

  cycleModalInd(): any | null {
    return this.indicadores.find(i => i.id === this.cycleModalId) ?? null;
  }

  toggleCycleAction(actionId: string) {
    const idx = this.cycleForm.acoesConcluidasIds.indexOf(actionId);
    if (idx >= 0) this.cycleForm.acoesConcluidasIds.splice(idx, 1);
    else this.cycleForm.acoesConcluidasIds.push(actionId);
  }

  submitCycle() {
    if (!this.hasVal(this.cycleForm.valor)) return;
    const payload = {
      valor: Number(this.cycleForm.valor),
      observacao: this.cycleForm.observacao || null,
      dataReferencia: this.cycleForm.dataReferencia ? `${this.cycleForm.dataReferencia}T00:00:00Z` : null,
      acoesConcluidasIds: this.cycleForm.acoesConcluidasIds,
    };
    this.addCycle.emit({ indicatorId: this.cycleModalId, payload });
    this.closeCycleModal();
  }

  // â”€â”€ batch modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  openBatch() {
    const ativos = this.indicadores.filter(i => i.status === 'ATIVO');
    this.batchEntries = ativos.map(ind => ({
      id: ind.id,
      titulo: ind.titulo,
      valorAtual: this.valorAtual(ind),
      unidade: ind.unidade ?? '',
      meta: ind.meta ?? null,
      novoValor: '',
      observacao: '',
      dataReferencia: '',
      acoesExpanded: false,
      acoes: this.acoesAbertas(ind),
      acoesConcluidasIds: [],
    }));
    this.batchOpen = true;
  }

  closeBatch() {
    this.batchOpen = false;
    this.batchEntries = [];
  }

  toggleBatchAction(entry: any, actionId: string) {
    const idx = entry.acoesConcluidasIds.indexOf(actionId);
    if (idx >= 0) entry.acoesConcluidasIds.splice(idx, 1);
    else entry.acoesConcluidasIds.push(actionId);
  }

  submitBatch() {
    const toSubmit = this.batchEntries.filter(e => this.hasVal(e.novoValor));
    for (const entry of toSubmit) {
      const payload = {
        valor: Number(entry.novoValor),
        observacao: entry.observacao || null,
        dataReferencia: entry.dataReferencia ? `${entry.dataReferencia}T00:00:00Z` : null,
        acoesConcluidasIds: entry.acoesConcluidasIds,
      };
      this.addCycle.emit({ indicatorId: entry.id, payload });
    }
    this.closeBatch();
  }

  batchHasUpdates(): boolean {
    return this.batchEntries.some(e => this.hasVal(e.novoValor));
  }

  batchUpdateCount(): number {
    return this.batchEntries.filter(e => this.hasVal(e.novoValor)).length;
  }

  // â”€â”€ cycle edit/delete (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  openCycleEdit(indId: string, ciclo: any) {
    this.cycleEditModalIndId = indId;
    this.cycleEditModalCicloId = ciclo.id;
    const dr = ciclo.dataReferencia ? new Date(ciclo.dataReferencia).toISOString().slice(0, 10) : '';
    this.cycleEditForm = {
      valor: ciclo.valor != null ? String(ciclo.valor) : '',
      observacao: ciclo.observacao ?? '',
      dataReferencia: dr,
    };
  }

  closeCycleEdit() {
    this.cycleEditModalIndId = '';
    this.cycleEditModalCicloId = '';
    this.cycleEditForm = { valor: '', observacao: '', dataReferencia: '' };
  }

  submitCycleEdit() {
    if (!this.cycleEditForm.valor && this.cycleEditForm.valor !== '0') return;
    this.updateCycle.emit({
      indicatorId: this.cycleEditModalIndId,
      cycleId: this.cycleEditModalCicloId,
      payload: {
        valor: Number(this.cycleEditForm.valor),
        observacao: this.cycleEditForm.observacao || null,
        dataReferencia: this.cycleEditForm.dataReferencia ? `${this.cycleEditForm.dataReferencia}T00:00:00Z` : null,
      },
    });
    this.closeCycleEdit();
  }

  excluirCiclo(indicatorId: string, cycleId: string) {
    this.removeCycle.emit({ indicatorId, cycleId });
  }

  // â”€â”€ action CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  openActionModal(indicatorId: string, action?: any) {
    this.actionModalId = indicatorId;
    if (action) {
      this.editingActionId = action.id;
      this.actionForm = {
        descricao:   action.descricao ?? '',
        responsavel: action.responsavel ?? '',
        prazo:       action.prazo ? new Date(action.prazo).toISOString().slice(0, 10) : '',
      };
    } else {
      this.editingActionId = '';
      this.actionForm = this.emptyActionForm();
    }
  }

  closeActionModal() {
    this.actionModalId = '';
    this.editingActionId = '';
    this.actionForm = this.emptyActionForm();
  }

  submitAction() {
    const payload = {
      descricao:   this.actionForm.descricao,
      responsavel: this.actionForm.responsavel,
      prazo:       this.actionForm.prazo ? `${this.actionForm.prazo}T00:00:00Z` : null,
    };
    if (this.editingActionId) {
      this.updateAction.emit({
        indicatorId: this.actionModalId,
        actionId: this.editingActionId,
        payload: { ...payload, status: 'ABERTA' },
      });
    } else {
      this.addAction.emit({ indicatorId: this.actionModalId, payload });
    }
    this.closeActionModal();
  }

  excluirAction(indicatorId: string, actionId: string) {
    this.removeAction.emit({ indicatorId, actionId });
  }

  concludeAction(ind: any, action: any) {
    this.updateAction.emit({
      indicatorId: ind.id,
      actionId: action.id,
      payload: {
        descricao:   action.descricao,
        responsavel: action.responsavel,
        prazo:       action.prazo ?? null,
        status:      'CONCLUIDA',
      },
    });
  }

  reopenAction(ind: any, action: any) {
    this.updateAction.emit({
      indicatorId: ind.id,
      actionId: action.id,
      payload: {
        descricao:   action.descricao,
        responsavel: action.responsavel,
        prazo:       action.prazo ?? null,
        status:      'ABERTA',
      },
    });
  }

  // â”€â”€ label helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tipoLabel(t: string)       { return this.tipos.find(x => x.value === this.normalizeTipo(t))?.label ?? 'Técnico'; }
  categoriaLabel(c: string)  { return this.categorias.find(x => x.value === c)?.label ?? c; }
  frequenciaLabel(f: string) { return this.frequencias.find(x => x.value === f)?.label ?? f; }
  polaridadeLabel(p: string) { return this.polaridades.find(x => x.value === p)?.label ?? p; }

  formatDate(value: any) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  }

  formatVal(v: any, unidade: string): string {
    if (v == null) return '—';
    const num = Number(v);
    if (isNaN(num)) return '—';
    return `${num.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unidade ? ' ' + unidade : ''}`;
  }

  // â”€â”€ PDF export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  exportandoPDF = false;

  async exportarPDF() {
    if (this.exportandoPDF) return;
    this.exportandoPDF = true;

    try {
      const inds = this.filtered();
      if (!inds.length) return;

      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();   // 297
      const H = doc.internal.pageSize.getHeight();  // 210
      const now = new Date();
      const exportDate = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const exportTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const total = inds.length;

      const drawFooter = (pageNum: number) => {
        doc.setFillColor(241, 245, 249);
        doc.rect(0, H - 7, W, 7, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(0, H - 7, W, H - 7);
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text('Sistema de Planejamento - Relatorio confidencial', 12, H - 2.5);
        doc.text(`Indicador ${pageNum} de ${total}`, W - 12, H - 2.5, { align: 'right' });
      };

      // ── one page per indicator ────────────────────────────────────────────
      inds.forEach((ind, pageIdx) => {
        if (pageIdx > 0) doc.addPage();

        // Header band
        doc.setFillColor(30, 64, 175);
        doc.rect(0, 0, W, 19, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(String(ind.titulo ?? 'Indicador').slice(0, 65), 12, 9.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`${this.tipoLabel(ind.tipo)}  -  ${this.categoriaLabel(ind.categoria)}`, 12, 15);
        doc.text(`Gerado em ${exportDate} as ${exportTime}`, W - 12, 9.5, { align: 'right' });

        // Status badge
        if (ind.status === 'ATIVO') { doc.setFillColor(34, 197, 94); } else { doc.setFillColor(148, 163, 184); }
        doc.roundedRect(W - 44, 12.5, 32, 5.5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text(ind.status === 'ATIVO' ? 'ATIVO' : 'INATIVO', W - 28, 15.8, { align: 'center' });

        // Info boxes
        const boxTop = 22;
        const boxH = 18;
        const pad = 3;
        const boxW = (W - 24 - pad * 3) / 4;

        const drawBox = (x: number, label: string, value: string, sub: string = '') => {
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(x, boxTop, boxW, boxH, 1.5, 1.5, 'F');
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.roundedRect(x, boxTop, boxW, boxH, 1.5, 1.5, 'S');
          doc.setTextColor(100, 116, 139);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.text(label, x + 3, boxTop + 5);
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text(value.slice(0, 22), x + 3, boxTop + 12);
          if (sub) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.5);
            doc.setTextColor(100, 116, 139);
            doc.text(sub.slice(0, 36), x + 3, boxTop + 16.5);
          }
        };

        const valAtual = this.valorAtual(ind);
        const pct = this.pctMeta(ind);
        const metaOk = this.metaAtingida(ind);

        drawBox(12,                    'Responsavel',  ind.responsavel ?? '—',              this.frequenciaLabel(ind.frequencia));
        drawBox(12 + (boxW + pad),     'Meta',         this.formatVal(ind.meta, ind.unidade),    this.polaridadeLabel(ind.polaridade));
        drawBox(12 + (boxW + pad) * 2, 'Valor Atual',  this.formatVal(valAtual, ind.unidade),    ind.descricao ? String(ind.descricao).slice(0, 36) : '');

        // % meta box with accent colour
        const pctBgR = metaOk ? 240 : pct >= 80 ? 254 : 254;
        const pctBgG = metaOk ? 253 : pct >= 80 ? 252 : 242;
        const pctBgB = metaOk ? 244 : pct >= 80 ? 232 : 242;
        const pctFgR = metaOk ?  22 : pct >= 80 ? 161 : 185;
        const pctFgG = metaOk ? 163 : pct >= 80 ?  98 :  28;
        const pctFgB = metaOk ?  74 : pct >= 80 ?   7 :  28;
        const pctX = 12 + (boxW + pad) * 3;
        doc.setFillColor(pctBgR, pctBgG, pctBgB);
        doc.roundedRect(pctX, boxTop, boxW, boxH, 1.5, 1.5, 'F');
        doc.setDrawColor(pctFgR, pctFgG, pctFgB);
        doc.setLineWidth(0.5);
        doc.roundedRect(pctX, boxTop, boxW, boxH, 1.5, 1.5, 'S');
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.text('% da Meta', pctX + 3, boxTop + 5);
        doc.setTextColor(pctFgR, pctFgG, pctFgB);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(pct > 0 ? `${pct}%` : '—', pctX + 3, boxTop + 12);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.text(metaOk ? 'Meta atingida' : pct >= 80 ? 'Proximo da meta' : 'Abaixo da meta', pctX + 3, boxTop + 16.5);

        // Chart
        const cTop = boxTop + boxH + 4;  // 44
        const cLeft = 12;
        const cW = W - 24;
        const cH = 54;

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cLeft, cTop, cW, cH, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(cLeft, cTop, cW, cH, 2, 2, 'S');
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text('Historico de Valores (ciclos)', cLeft + 3, cTop + 5.5);

        const ciclos = ((ind.ciclos ?? []) as any[])
          .filter((c: any) => c.valor != null)
          .sort((a: any, b: any) =>
            new Date(a.dataReferencia ?? a.criadoEm).getTime() -
            new Date(b.dataReferencia ?? b.criadoEm).getTime()
          );

        if (ciclos.length >= 2) {
          const gx = cLeft + 16;
          const gy = cTop + 9;
          const gw = cW - 24;
          const gh = cH - 16;
          const vals = ciclos.map((c: any) => Number(c.valor));
          const minV = Math.min(...vals);
          const maxV = Math.max(...vals);
          const range = maxV - minV || 1;

          // Y-axis grid lines
          doc.setLineWidth(0.2);
          for (let gi = 0; gi <= 4; gi++) {
            const lineY = gy + (gi / 4) * gh;
            doc.setDrawColor(226, 232, 240);
            doc.line(gx, lineY, gx + gw, lineY);
            const yLbl = (maxV - (gi / 4) * range).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
            doc.setTextColor(148, 163, 184);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5);
            doc.text(yLbl, gx - 2, lineY + 1, { align: 'right' });
          }

          // Axes
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.4);
          doc.line(gx, gy, gx, gy + gh);
          doc.line(gx, gy + gh, gx + gw, gy + gh);

          // Meta line (manual dashes)
          if (ind.meta != null) {
            const metaLineY = gy + gh - ((Number(ind.meta) - minV) / range) * gh;
            if (metaLineY >= gy && metaLineY <= gy + gh) {
              doc.setDrawColor(239, 68, 68);
              doc.setLineWidth(0.5);
              let dx = gx;
              while (dx < gx + gw) { doc.line(dx, metaLineY, Math.min(dx + 3, gx + gw), metaLineY); dx += 5; }
              doc.setTextColor(239, 68, 68);
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(5);
              doc.text('meta', gx + gw + 2, metaLineY + 1.5);
            }
          }

          // Data line
          doc.setDrawColor(37, 99, 235);
          doc.setLineWidth(0.9);
          for (let i = 1; i < ciclos.length; i++) {
            const x0 = gx + ((i - 1) / (ciclos.length - 1)) * gw;
            const x1 = gx + (i       / (ciclos.length - 1)) * gw;
            const y0 = gy + gh - ((vals[i - 1] - minV) / range) * gh;
            const y1 = gy + gh - ((vals[i]     - minV) / range) * gh;
            doc.line(x0, y0, x1, y1);
          }

          // Dots + x-axis labels
          doc.setLineWidth(0.3);
          ciclos.forEach((c: any, i: number) => {
            const px = gx + (i / (ciclos.length - 1)) * gw;
            const py = gy + gh - ((vals[i] - minV) / range) * gh;
            doc.setFillColor(37, 99, 235);
            doc.circle(px, py, 1, 'F');
            if (ciclos.length <= 24) {
              const dt = c.dataReferencia ?? c.criadoEm;
              if (dt) {
                const lbl = new Date(dt).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                doc.setTextColor(100, 116, 139);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(4.5);
                doc.text(lbl, px, gy + gh + 4, { align: 'center' });
              }
            }
          });
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          const msg = ciclos.length === 0 ? 'Sem ciclos registrados.' : `1 ciclo: ${this.formatVal(ciclos[0].valor, ind.unidade)}`;
          doc.text(msg, cLeft + cW / 2, cTop + cH / 2, { align: 'center' });
        }

        // Tasks section (open left | closed right)
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tY = cTop + cH + 6;  // ≈ 104
        const halfW = (W - 24 - 6) / 2;  // ≈ 133.5

        const openAcoes   = ((ind.acoes ?? []) as any[]).filter((a: any) => a?.status === 'ABERTA');
        const closedAcoes = ((ind.acoes ?? []) as any[]).filter((a: any) => a?.status === 'CONCLUIDA');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(`Acoes Abertas (${openAcoes.length})`, 12, tY - 1.5);
        doc.text(`Acoes Concluidas (${closedAcoes.length})`, 12 + halfW + 6, tY - 1.5);

        const openRows = openAcoes.map((a: any) => {
          const prazoDate = a?.prazo ? new Date(a.prazo) : null;
          const isLate = !!prazoDate && !isNaN(prazoDate.getTime()) && prazoDate < today;
          return [
            a?.descricao ?? '—',
            a?.responsavel ?? '—',
            prazoDate && !isNaN(prazoDate.getTime()) ? prazoDate.toLocaleDateString('pt-BR') : '—',
            isLate ? 'Atrasada' : 'OK',
          ];
        });

        const closedRows = closedAcoes.map((a: any) => {
          const prazoDate = a?.prazo ? new Date(a.prazo) : null;
          return [
            a?.descricao ?? '—',
            a?.responsavel ?? '—',
            prazoDate && !isNaN(prazoDate.getTime()) ? prazoDate.toLocaleDateString('pt-BR') : '—',
          ];
        });

        autoTable(doc, {
          startY: tY,
          head: [['Descricao', 'Responsavel', 'Prazo', 'Sit.']],
          body: openRows.length ? openRows : [['Nenhuma acao aberta', '', '', '']],
          theme: 'striped',
          margin: { left: 12, right: W - 12 - halfW },
          headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255], fontSize: 6.5, cellPadding: 1.5 },
          bodyStyles: { fontSize: 6, cellPadding: 1.4 },
          columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 28 }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 14, halign: 'center' } },
          didParseCell: (data: any) => {
            if (data.section !== 'body' || data.column.index !== 3) return;
            if (String(data.cell.raw) === 'Atrasada') {
              data.cell.styles.textColor = [185, 28, 28];
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [5, 150, 105];
            }
          },
        });

        autoTable(doc, {
          startY: tY,
          head: [['Descricao', 'Responsavel', 'Prazo']],
          body: closedRows.length ? closedRows : [['Nenhuma acao concluida', '', '']],
          theme: 'striped',
          margin: { left: 12 + halfW + 6, right: 12 },
          headStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255], fontSize: 6.5, cellPadding: 1.5 },
          bodyStyles: { fontSize: 6, cellPadding: 1.4, textColor: [107, 114, 128] },
          columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 28 }, 2: { cellWidth: 18, halign: 'center' } },
        });

        drawFooter(pageIdx + 1);
      });

      doc.save(`indicadores-${now.toISOString().slice(0, 10)}.pdf`);
    } finally {
      this.exportandoPDF = false;
    }
  }

  // â”€â”€ private â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private emptyIndForm() {
    return {
      titulo: '', descricao: '', tipo: 'TECNICO', categoria: 'QUALIDADE',
      unidade: '', meta: '', polaridade: 'MAIOR_MELHOR',
      frequencia: 'MENSAL', responsavel: '', status: 'ATIVO',
      valorInicial:        '',   // só na criação
      novoValor:           '',   // só na edição
      novaDataReferencia:  '',   // só na edição
    };
  }

  private normalizeTipo(raw: any): 'TECNICO' | 'NEGOCIO' {
    const v = String(raw ?? '').trim().toUpperCase();
    if (v === 'TECNICO' || v === 'TÉCNICO') return 'TECNICO';
    if (v === 'NEGOCIO' || v === 'NEGÓCIO' || v === 'NAO' || v === 'NÃO') return 'NEGOCIO';
    return 'TECNICO';
  }

  private emptyCycleForm() {
    return { valor: '', observacao: '', dataReferencia: '', acoesConcluidasIds: [] as string[] };
  }

  private emptyActionForm() {
    return { descricao: '', responsavel: '', prazo: '' };
  }
}

