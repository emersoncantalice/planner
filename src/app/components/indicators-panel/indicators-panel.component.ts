import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-indicators-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  // ── view state ────────────────────────────────────────────────────────────
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

  // ── enums ─────────────────────────────────────────────────────────────────
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

  // ── filter/list helpers ───────────────────────────────────────────────────
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

  // ── computed helpers per indicator ────────────────────────────────────────
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

  // ── indicator CRUD ────────────────────────────────────────────────────────
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
      tipo:                ind.tipo ?? 'TECNICO',
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

  // ── single cycle modal ────────────────────────────────────────────────────
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

  // ── batch modal ───────────────────────────────────────────────────────────
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

  // ── cycle edit/delete (admin) ─────────────────────────────────────────────
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

  // ── action CRUD ───────────────────────────────────────────────────────────
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

  // ── label helpers ─────────────────────────────────────────────────────────
  tipoLabel(t: string)       { return this.tipos.find(x => x.value === t)?.label ?? t; }
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

  // ── private ───────────────────────────────────────────────────────────────
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

  private emptyCycleForm() {
    return { valor: '', observacao: '', dataReferencia: '', acoesConcluidasIds: [] as string[] };
  }

  private emptyActionForm() {
    return { descricao: '', responsavel: '', prazo: '' };
  }
}
