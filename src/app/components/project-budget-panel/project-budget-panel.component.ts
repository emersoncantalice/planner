import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';
import { uid } from '../../core/uid';

@Component({
  selector: 'app-project-budget-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectDirective],
  templateUrl: './project-budget-panel.component.html',
  styleUrl: './project-budget-panel.component.scss'
})
export class ProjectBudgetPanelComponent {
  @Input() orcamentos: any[] = [];
  @Input() templates: any[] = [];
  @Input() perfis: any[] = [];
  @Input() token = '';

  @Output() create = new EventEmitter<any>();
  @Output() update = new EventEmitter<{ id: string; payload: any }>();
  @Output() remove = new EventEmitter<string>();

  @Output() createTemplate = new EventEmitter<any>();
  @Output() updateTemplate = new EventEmitter<{ id: string; payload: any }>();
  @Output() removeTemplate = new EventEmitter<string>();

  // ── view state ────────────────────────────────────────────────────────────
  searchTerm = '';
  selectedId = '';
  activeTab: 'atividades' | 'cronograma' | 'cloud' | 'resumo' = 'atividades';

  // cloud cost form
  cloudFormOpen = false;
  editingCloudId = '';
  cloudForm = this.emptyCloudForm();

  // budget form
  formOpen = false;
  editingBudgetId = '';
  budgetForm = this.emptyBudgetForm();

  // activity form
  atividadeFormOpen = false;
  editingAtividadeId = '';
  atividadeForm = this.emptyAtividadeForm();

  // templates
  templatesModalOpen = false;
  editingTemplateId = '';
  templateForm = this.emptyTemplateForm();
  templateAtvForm = this.emptyTemplateAtvForm();
  editingTemplateAtvId = '';

  // template injection
  injetarModalOpen = false;
  injetarTemplateId = '';
  injetarDataBase = new Date().toISOString().slice(0, 10);

  readonly Number = Number;

  readonly ganttColors = [
    '#4f87f0', '#f59e0b', '#10b981', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
    '#84cc16', '#6366f1',
  ];

  // ── list helpers ──────────────────────────────────────────────────────────

  filtered(): any[] {
    const q = this.searchTerm.trim().toLowerCase();
    return this.orcamentos.filter(o =>
      !q || `${o.nome} ${o.descricao ?? ''}`.toLowerCase().includes(q)
    );
  }

  selectedOrcamento(): any | null {
    return this.orcamentos.find(o => o.id === this.selectedId) ?? null;
  }

  atividades(orc?: any): any[] {
    const o = orc ?? this.selectedOrcamento();
    return (o?.atividades ?? []) as any[];
  }

  atividadesOrdenadas(): any[] {
    return [...this.atividades()].sort((a, b) => {
      if (!a.dataInicio) return 1;
      if (!b.dataInicio) return -1;
      return a.dataInicio.localeCompare(b.dataInicio);
    });
  }

  // ── profile helpers ───────────────────────────────────────────────────────

  /** nomePerfil segue o padrao "Nome | Senioridade | Area" — partes podem faltar. */
  private perfilPartes(perfilId: string): string[] {
    const nome = String(this.perfis.find(p => p.id === perfilId)?.nomePerfil ?? '');
    return nome.split('|').map(s => s.trim()).filter(s => !!s);
  }

  /** Nome + senioridade, ex.: "QA · Senior". */
  perfilNome(perfilId: string): string {
    const partes = this.perfilPartes(perfilId);
    if (!partes.length) return perfilId;
    return partes.slice(0, 2).join(' · ');
  }

  perfilSenioridade(perfilId: string): string {
    return this.perfilPartes(perfilId)[1] ?? '';
  }

  perfilArea(perfilId: string): string {
    return this.perfilPartes(perfilId)[2] ?? '';
  }

  /** Rotulo completo para o <select>: nome, senioridade, area e valor/hora. */
  perfilOptionLabel(p: any): string {
    const partes = String(p?.nomePerfil ?? '').split('|').map((s: string) => s.trim()).filter((s: string) => !!s);
    const base = partes.slice(0, 2).join(' · ') || String(p?.nomePerfil ?? '');
    const area = partes[2] ? ` (${partes[2]})` : '';
    const valor = this.perfilValorHora(p?.id);
    return `${base}${area}${valor ? ' — ' + this.currency(valor) + '/h' : ''}`;
  }

  /** Perfis ordenados por nome + senioridade, para o select de atividade. */
  perfisOrdenados(): any[] {
    return [...this.perfis].sort((a, b) =>
      String(a?.nomePerfil ?? '').localeCompare(String(b?.nomePerfil ?? ''), 'pt-BR'));
  }

  perfilValorHora(perfilId: string): number {
    const raw = this.perfis.find(p => p.id === perfilId)?.valorHora ?? 0;
    return raw > 1000 ? raw / 100 : raw;
  }

  currency(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
  }

  // ── summary ───────────────────────────────────────────────────────────────

  resumoPorPerfil(): Array<{ perfilId: string; nome: string; horas: number; valorHora: number; total: number }> {
    const map = new Map<string, { nome: string; horas: number; valorHora: number }>();
    for (const a of this.atividades()) {
      if (!map.has(a.perfilId)) {
        map.set(a.perfilId, { nome: this.perfilNome(a.perfilId), horas: 0, valorHora: this.perfilValorHora(a.perfilId) });
      }
      map.get(a.perfilId)!.horas += Number(a.horas || 0);
    }
    return Array.from(map.entries())
      .map(([perfilId, v]) => ({ perfilId, ...v, total: v.horas * v.valorHora }))
      .sort((a, b) => b.total - a.total);
  }

  /** Custo de pessoas (horas x valor/hora do perfil). */
  totalPessoas(): number {
    return this.resumoPorPerfil().reduce((s, r) => s + r.total, 0);
  }

  /** Custo total do orcamento: pessoas + cloud anualizado. */
  totalGeral(): number {
    return this.totalPessoas() + this.totalCloud();
  }

  totalHoras(): number {
    return this.atividades().reduce((s, a) => s + Number(a.horas || 0), 0);
  }

  totalCustoBudget(orc: any): number {
    const pessoas = (orc.atividades ?? []).reduce((s: number, a: any) =>
      s + Number(a.horas || 0) * this.perfilValorHora(a.perfilId), 0);
    return pessoas + this.totalCloudDe(orc);
  }

  // ── cloud costs ───────────────────────────────────────────────────────────

  custosCloud(orc?: any): any[] {
    const o = orc ?? this.selectedOrcamento();
    return (o?.custosCloud ?? []) as any[];
  }

  /** Um item: mensal x meses contratados (12 por padrao = valor anual). */
  cloudTotalItem(c: any): number {
    return Number(c?.valorMensal || 0) * Math.max(0, Number(c?.mesesContratados ?? 12));
  }

  totalCloudDe(orc: any): number {
    return this.custosCloud(orc).reduce((s, c) => s + this.cloudTotalItem(c), 0);
  }

  totalCloud(): number {
    return this.totalCloudDe(this.selectedOrcamento());
  }

  /** Soma dos valores mensais — util para leitura do "run rate" do orcamento. */
  totalCloudMensal(): number {
    return this.custosCloud().reduce((s, c) => s + Number(c.valorMensal || 0), 0);
  }

  openCloudCreate() {
    this.editingCloudId = '';
    this.cloudForm = this.emptyCloudForm();
    this.cloudFormOpen = true;
  }

  openCloudEdit(c: any) {
    this.editingCloudId = c.id;
    this.cloudForm = {
      nome: c.nome ?? '',
      servico: c.servico ?? '',
      valorMensal: c.valorMensal ?? 0,
      mesesContratados: c.mesesContratados ?? 12,
    };
    this.cloudFormOpen = true;
  }

  cancelCloudForm() {
    this.cloudFormOpen = false;
    this.editingCloudId = '';
    this.cloudForm = this.emptyCloudForm();
  }

  submitCloud() {
    if (!this.cloudForm.nome.trim()) return;
    const orc = this.selectedOrcamento();
    if (!orc) return;
    const custosCloud = [...(orc.custosCloud ?? [])];
    if (this.editingCloudId) {
      const idx = custosCloud.findIndex((c: any) => c.id === this.editingCloudId);
      if (idx >= 0) custosCloud[idx] = { ...custosCloud[idx], ...this.cloudForm };
    } else {
      custosCloud.push({ id: uid(), ...this.cloudForm });
    }
    this.update.emit({ id: orc.id, payload: { ...orc, custosCloud } });
    this.cancelCloudForm();
  }

  excluirCloud(cloudId: string) {
    const orc = this.selectedOrcamento();
    if (!orc) return;
    const custosCloud = (orc.custosCloud ?? []).filter((c: any) => c.id !== cloudId);
    this.update.emit({ id: orc.id, payload: { ...orc, custosCloud } });
  }

  // ── sidebar helpers ───────────────────────────────────────────────────────

  orcDateRange(orc: any): string {
    const ativs = ((orc?.atividades ?? []) as any[]).filter((a: any) => a.dataInicio && a.dataFim);
    if (!ativs.length) return '';
    const min = [...ativs].sort((a: any, b: any) => a.dataInicio.localeCompare(b.dataInicio))[0].dataInicio;
    const max = [...ativs].sort((a: any, b: any) => b.dataFim.localeCompare(a.dataFim))[0].dataFim;
    return `${this.formatDate(min)} → ${this.formatDate(max)}`;
  }

  orcTotalDays(orc: any): number {
    const ativs = ((orc?.atividades ?? []) as any[]).filter((a: any) => a.dataInicio && a.dataFim);
    if (!ativs.length) return 0;
    const min = [...ativs].sort((a: any, b: any) => a.dataInicio.localeCompare(b.dataInicio))[0].dataInicio;
    const max = [...ativs].sort((a: any, b: any) => b.dataFim.localeCompare(a.dataFim))[0].dataFim;
    return this.dayDiff(min, max) + 1;
  }

  // ── gantt ─────────────────────────────────────────────────────────────────

  todayPct(): number | null {
    const range = this.ganttRange();
    if (!range) return null;
    const today = new Date().toISOString().slice(0, 10);
    if (today < range.minDate || today > range.maxDate) return null;
    return (this.dayDiff(range.minDate, today) / range.totalDays) * 100;
  }

  atividadeDuration(a: any): string {
    if (!a.dataInicio || !a.dataFim) return '';
    const d = this.dayDiff(a.dataInicio, a.dataFim) + 1;
    return `${d}d`;
  }

  dayDiff(a: string, b: string): number {
    return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
  }

  ganttRange(): { minDate: string; maxDate: string; totalDays: number } | null {
    const ativs = this.atividades().filter(a => a.dataInicio && a.dataFim);
    if (!ativs.length) return null;
    const minDate = [...ativs].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0].dataInicio;
    const maxDate = [...ativs].sort((a, b) => b.dataFim.localeCompare(a.dataFim))[0].dataFim;
    return { minDate, maxDate, totalDays: this.dayDiff(minDate, maxDate) + 1 };
  }

  ganttBarStyle(a: any): Record<string, string> {
    const range = this.ganttRange();
    if (!range || !a.dataInicio || !a.dataFim) return { display: 'none' };
    const left = (this.dayDiff(range.minDate, a.dataInicio) / range.totalDays) * 100;
    const width = ((this.dayDiff(a.dataInicio, a.dataFim) + 1) / range.totalDays) * 100;
    return { left: `${left.toFixed(2)}%`, width: `${Math.max(0.8, width).toFixed(2)}%`, background: a.cor || '#4f87f0' };
  }

  ganttMonths(): Array<{ label: string; leftPct: number; widthPct: number }> {
    const range = this.ganttRange();
    if (!range) return [];
    const start = new Date(range.minDate + 'T00:00:00');
    const end   = new Date(range.maxDate + 'T00:00:00');
    const result: Array<{ label: string; leftPct: number; widthPct: number }> = [];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const mStart = new Date(Math.max(cur.getTime(), start.getTime()));
      const mEnd   = new Date(Math.min(next.getTime() - 86400000, end.getTime()));
      const leftDays  = Math.round((mStart.getTime() - start.getTime()) / 86400000);
      const widthDays = Math.round((mEnd.getTime() - mStart.getTime()) / 86400000) + 1;
      result.push({
        label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/'),
        leftPct:  (leftDays  / range.totalDays) * 100,
        widthPct: (widthDays / range.totalDays) * 100,
      });
      cur = next;
    }
    return result;
  }

  // ── budget CRUD ───────────────────────────────────────────────────────────

  openCreate() {
    this.editingBudgetId = '';
    this.budgetForm = this.emptyBudgetForm();
    this.formOpen = true;
  }

  openEdit(orc: any) {
    this.editingBudgetId = orc.id;
    this.budgetForm = { nome: orc.nome ?? '', descricao: orc.descricao ?? '' };
    this.formOpen = true;
  }

  cancelForm() {
    this.formOpen = false;
    this.editingBudgetId = '';
    this.budgetForm = this.emptyBudgetForm();
  }

  submitBudget() {
    if (!this.budgetForm.nome.trim()) return;
    if (this.editingBudgetId) {
      const orc = this.orcamentos.find(o => o.id === this.editingBudgetId);
      this.update.emit({ id: this.editingBudgetId, payload: { ...orc, ...this.budgetForm } });
    } else {
      this.create.emit({ ...this.budgetForm, atividades: [] });
    }
    this.cancelForm();
  }

  excluirOrcamento(id: string) {
    this.remove.emit(id);
    if (this.selectedId === id) this.selectedId = '';
  }

  /** Copia um orcamento inteiro (dados + atividades) gerando um novo. */
  duplicarOrcamento(orc: any) {
    this.create.emit({
      nome: this.nomeCopia(orc.nome),
      descricao: orc.descricao ?? '',
      atividades: (orc.atividades ?? []).map((a: any) => ({ ...a, id: uid() })),
      custosCloud: (orc.custosCloud ?? []).map((c: any) => ({ ...c, id: uid() })),
    });
  }

  /** "Projeto Alpha" -> "Projeto Alpha (cópia)" -> "Projeto Alpha (cópia 2)" ... */
  private nomeCopia(nome: string): string {
    const base = String(nome ?? '').replace(/\s*\(cópia(?:\s+\d+)?\)$/i, '').trim();
    const existentes = new Set(this.orcamentos.map(o => String(o.nome ?? '').trim().toLowerCase()));
    let candidato = `${base} (cópia)`;
    let n = 2;
    while (existentes.has(candidato.toLowerCase())) candidato = `${base} (cópia ${n++})`;
    return candidato;
  }

  // ── activity CRUD ─────────────────────────────────────────────────────────

  openAtividadeCreate() {
    this.editingAtividadeId = '';
    this.atividadeForm = this.emptyAtividadeForm();
    this.atividadeFormOpen = true;
  }

  openAtividadeEdit(a: any) {
    this.editingAtividadeId = a.id;
    this.atividadeForm = { nome: a.nome ?? '', perfilId: a.perfilId ?? '', horas: a.horas ?? 0, dataInicio: a.dataInicio ?? '', dataFim: a.dataFim ?? '' };
    this.atividadeFormOpen = true;
  }

  recalcHoras() {
    const { dataInicio, dataFim } = this.atividadeForm;
    if (!dataInicio || !dataFim || dataFim < dataInicio) return;
    this.atividadeForm.horas = (this.dayDiff(dataInicio, dataFim) + 1) * 8;
  }

  cancelAtividadeForm() {
    this.atividadeFormOpen = false;
    this.editingAtividadeId = '';
    this.atividadeForm = this.emptyAtividadeForm();
  }

  submitAtividade() {
    if (!this.atividadeForm.nome.trim() || !this.atividadeForm.perfilId) return;
    const orc = this.selectedOrcamento();
    if (!orc) return;
    const atividades = [...(orc.atividades ?? [])];
    if (this.editingAtividadeId) {
      const idx = atividades.findIndex((a: any) => a.id === this.editingAtividadeId);
      if (idx >= 0) atividades[idx] = { ...atividades[idx], ...this.atividadeForm };
    } else {
      atividades.push({
        id: uid(),
        ...this.atividadeForm,
        cor: this.ganttColors[atividades.length % this.ganttColors.length],
      });
    }
    this.update.emit({ id: orc.id, payload: { ...orc, atividades } });
    this.cancelAtividadeForm();
  }

  excluirAtividade(atividadeId: string) {
    const orc = this.selectedOrcamento();
    if (!orc) return;
    const atividades = (orc.atividades ?? []).filter((a: any) => a.id !== atividadeId);
    this.update.emit({ id: orc.id, payload: { ...orc, atividades } });
  }

  // ── templates ─────────────────────────────────────────────────────────────

  openTemplates() {
    this.templatesModalOpen = true;
    this.cancelTemplateForm();
  }

  closeTemplates() {
    this.templatesModalOpen = false;
    this.cancelTemplateForm();
  }

  openTemplateCreate() {
    this.editingTemplateId = '';
    this.templateForm = this.emptyTemplateForm();
    this.cancelTemplateAtvForm();
  }

  openTemplateEdit(t: any) {
    this.editingTemplateId = t.id;
    this.templateForm = {
      nome: t.nome ?? '',
      descricao: t.descricao ?? '',
      atividades: (t.atividades ?? []).map((a: any) => ({ ...a })),
    };
    this.cancelTemplateAtvForm();
  }

  cancelTemplateForm() {
    this.editingTemplateId = '';
    this.templateForm = this.emptyTemplateForm();
    this.cancelTemplateAtvForm();
  }

  submitTemplate() {
    if (!this.templateForm.nome.trim()) return;
    const payload = {
      nome: this.templateForm.nome.trim(),
      descricao: this.templateForm.descricao,
      atividades: this.templateForm.atividades,
    };
    if (this.editingTemplateId) this.updateTemplate.emit({ id: this.editingTemplateId, payload });
    else this.createTemplate.emit(payload);
    this.cancelTemplateForm();
  }

  excluirTemplate(id: string) {
    this.removeTemplate.emit(id);
    if (this.editingTemplateId === id) this.cancelTemplateForm();
    if (this.injetarTemplateId === id) this.injetarTemplateId = '';
  }

  // template activities (edited in-memory, persisted with the template)

  openTemplateAtvEdit(a: any) {
    this.editingTemplateAtvId = a.id;
    this.templateAtvForm = {
      nome: a.nome ?? '',
      perfilId: a.perfilId ?? '',
      horas: a.horas ?? 0,
      offsetDias: a.offsetDias ?? 0,
      duracaoDias: a.duracaoDias ?? 1,
    };
  }

  cancelTemplateAtvForm() {
    this.editingTemplateAtvId = '';
    this.templateAtvForm = this.emptyTemplateAtvForm();
  }

  /** Duracao muda -> horas acompanham (8h/dia), como no formulario de atividade. */
  recalcHorasTemplate() {
    const d = Number(this.templateAtvForm.duracaoDias || 0);
    if (d > 0) this.templateAtvForm.horas = d * 8;
  }

  submitTemplateAtv() {
    const f = this.templateAtvForm;
    if (!f.nome.trim() || !f.perfilId) return;
    const atividades = [...this.templateForm.atividades];
    if (this.editingTemplateAtvId) {
      const idx = atividades.findIndex((a: any) => a.id === this.editingTemplateAtvId);
      if (idx >= 0) atividades[idx] = { ...atividades[idx], ...f };
    } else {
      atividades.push({
        id: uid(),
        ...f,
        cor: this.ganttColors[atividades.length % this.ganttColors.length],
      });
    }
    this.templateForm.atividades = atividades;
    this.cancelTemplateAtvForm();
  }

  excluirTemplateAtv(id: string) {
    this.templateForm.atividades = this.templateForm.atividades.filter((a: any) => a.id !== id);
    if (this.editingTemplateAtvId === id) this.cancelTemplateAtvForm();
  }

  /** Proximo offset sugerido: logo apos a ultima atividade do template. */
  proximoOffsetTemplate(): number {
    return this.templateForm.atividades.reduce(
      (max: number, a: any) => Math.max(max, Number(a.offsetDias || 0) + Number(a.duracaoDias || 1)), 0);
  }

  novaAtividadeTemplate() {
    this.cancelTemplateAtvForm();
    this.templateAtvForm.offsetDias = this.proximoOffsetTemplate();
  }

  templateHoras(t: any): number {
    return (t?.atividades ?? []).reduce((s: number, a: any) => s + Number(a.horas || 0), 0);
  }

  templateCusto(t: any): number {
    return (t?.atividades ?? []).reduce(
      (s: number, a: any) => s + Number(a.horas || 0) * this.perfilValorHora(a.perfilId), 0);
  }

  templateDuracao(t: any): number {
    return (t?.atividades ?? []).reduce(
      (max: number, a: any) => Math.max(max, Number(a.offsetDias || 0) + Number(a.duracaoDias || 1)), 0);
  }

  /** Converte o orcamento selecionado em template (datas viram offsets relativos). */
  salvarComoTemplate() {
    const orc = this.selectedOrcamento();
    if (!orc) return;
    const ativs = (orc.atividades ?? []) as any[];
    const comData = ativs.filter(a => a.dataInicio);
    const base = comData.length
      ? [...comData].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0].dataInicio
      : '';
    this.templatesModalOpen = true;
    this.editingTemplateId = '';
    this.templateForm = {
      nome: `${orc.nome} (template)`,
      descricao: orc.descricao ?? '',
      atividades: ativs.map((a, i) => ({
        id: uid(),
        nome: a.nome,
        perfilId: a.perfilId,
        horas: Number(a.horas || 0),
        offsetDias: base && a.dataInicio ? this.dayDiff(base, a.dataInicio) : 0,
        duracaoDias: a.dataInicio && a.dataFim ? this.dayDiff(a.dataInicio, a.dataFim) + 1 : 1,
        cor: a.cor || this.ganttColors[i % this.ganttColors.length],
      })),
    };
    this.cancelTemplateAtvForm();
  }

  // ── template injection ────────────────────────────────────────────────────

  openInjetar() {
    if (!this.selectedOrcamento()) return;
    this.injetarTemplateId = this.templates[0]?.id ?? '';
    this.injetarDataBase = this.sugestaoDataBase();
    this.injetarModalOpen = true;
  }

  closeInjetar() {
    this.injetarModalOpen = false;
    this.injetarTemplateId = '';
  }

  /** Comeca logo depois da ultima atividade do orcamento; senao, hoje. */
  private sugestaoDataBase(): string {
    const range = this.ganttRange();
    if (!range) return new Date().toISOString().slice(0, 10);
    return this.addDays(range.maxDate, 1);
  }

  templateSelecionado(): any | null {
    return this.templates.find(t => t.id === this.injetarTemplateId) ?? null;
  }

  injetarTemplate() {
    const orc = this.selectedOrcamento();
    const tpl = this.templateSelecionado();
    if (!orc || !tpl) return;
    const atividades = [...(orc.atividades ?? [])];
    const base = this.injetarDataBase;
    for (const a of (tpl.atividades ?? []) as any[]) {
      const offset = Number(a.offsetDias || 0);
      const duracao = Math.max(1, Number(a.duracaoDias || 1));
      const dataInicio = base ? this.addDays(base, offset) : '';
      const dataFim = dataInicio ? this.addDays(dataInicio, duracao - 1) : '';
      atividades.push({
        id: uid(),
        nome: a.nome,
        perfilId: a.perfilId,
        horas: Number(a.horas || 0) || duracao * 8,
        dataInicio,
        dataFim,
        cor: a.cor || this.ganttColors[atividades.length % this.ganttColors.length],
      });
    }
    this.update.emit({ id: orc.id, payload: { ...orc, atividades } });
    this.closeInjetar();
  }

  private addDays(date: string, days: number): string {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ── PDF export ────────────────────────────────────────────────────────────

  exportandoPDF = false;

  async exportarPDF() {
    const orc = this.selectedOrcamento();
    if (!orc || this.exportandoPDF) return;
    this.exportandoPDF = true;
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const now = new Date();

      // header
      doc.setFillColor(15, 52, 96);
      doc.rect(0, 0, W, 26, 'F');
      doc.setFillColor(29, 99, 218);
      doc.rect(0, 22, W, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Orçamento de Projeto', 14, 11);
      doc.setFontSize(10);
      doc.text(orc.nome, 14, 19);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, W - 14, 11, { align: 'right' });
      if (orc.descricao) doc.text(orc.descricao, W - 14, 18, { align: 'right', maxWidth: 100 });

      // KPIs
      const resumo = this.resumoPorPerfil();
      const kpis: { label: string; value: string; color: [number, number, number] }[] = [
        { label: 'Atividades',      value: String(this.atividades().length),  color: [30, 64, 175] },
        { label: 'Total de Horas',  value: `${this.totalHoras()}h`,           color: [5, 122, 85] },
        { label: 'Perfis',          value: String(resumo.length),             color: [109, 40, 217] },
        { label: 'Custo Total',     value: this.currency(this.totalGeral()),  color: [161, 65, 0] },
      ];
      const kpiY = 30; const kpiW = (W - 28 - 9) / 4;
      kpis.forEach((k, i) => {
        const x = 14 + i * (kpiW + 3);
        doc.setFillColor(...k.color);
        doc.roundedRect(x, kpiY, kpiW, 15, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(i === 3 ? 9 : 13); doc.setFont('helvetica', 'bold');
        doc.text(k.value, x + kpiW / 2, kpiY + 7, { align: 'center' });
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text(k.label, x + kpiW / 2, kpiY + 12.5, { align: 'center' });
      });

      // activities table
      autoTable(doc, {
        startY: kpiY + 19,
        head: [['Atividade', 'Perfil', 'Horas', 'Início', 'Fim', 'Duração (d)', 'Custo']],
        body: this.atividadesOrdenadas().map(a => {
          const dur = a.dataInicio && a.dataFim ? String(this.dayDiff(a.dataInicio, a.dataFim) + 1) : '—';
          return [a.nome, this.perfilNome(a.perfilId), `${a.horas}h`, this.formatDate(a.dataInicio), this.formatDate(a.dataFim), dur, this.currency(Number(a.horas) * this.perfilValorHora(a.perfilId))];
        }),
        theme: 'striped',
        headStyles: { fillColor: [15, 52, 96], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 38 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 20, halign: 'center' }, 5: { cellWidth: 18, halign: 'center' }, 6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });

      // profile summary
      const y1 = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 52, 96);
      doc.text('Resumo por Perfil', 14, y1);
      const foot: string[][] = [['Subtotal pessoas', `${this.totalHoras()}h`, '', this.currency(this.totalPessoas())]];
      if (this.totalCloud()) {
        foot.push(['Cloud (anualizado)', '—', `${this.currency(this.totalCloudMensal())}/mês`, this.currency(this.totalCloud())]);
      }
      foot.push(['Total Geral', `${this.totalHoras()}h`, '', this.currency(this.totalGeral())]);
      autoTable(doc, {
        startY: y1 + 4,
        head: [['Perfil', 'Horas', 'Valor/hora', 'Total']],
        body: resumo.map(r => [r.nome, `${r.horas}h`, this.currency(r.valorHora), this.currency(r.total)]),
        foot,
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 52, 96], fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });

      // cloud costs
      if (this.custosCloud().length) {
        const yCloud = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 52, 96);
        doc.text('Custos de Cloud', 14, yCloud);
        autoTable(doc, {
          startY: yCloud + 4,
          head: [['Descrição', 'Serviço', 'Valor mensal', 'Meses', 'Total']],
          body: this.custosCloud().map(c => [
            c.nome, c.servico || '—', this.currency(Number(c.valorMensal || 0)),
            String(c.mesesContratados ?? 12), this.currency(this.cloudTotalItem(c)),
          ]),
          foot: [['Total', '', `${this.currency(this.totalCloudMensal())}/mês`, '', this.currency(this.totalCloud())]],
          theme: 'grid',
          headStyles: { fillColor: [21, 94, 117], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 7.5 },
          footStyles: { fillColor: [236, 254, 255], textColor: [21, 94, 117], fontStyle: 'bold', fontSize: 8 },
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        });
      }

      // gantt in PDF
      const range = this.ganttRange();
      const ativOrdenadas = this.atividadesOrdenadas().filter(a => a.dataInicio && a.dataFim);
      if (range && ativOrdenadas.length) {
        const ganttY0 = (doc as any).lastAutoTable.finalY + 10;
        if (ganttY0 < H - 50) {
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 52, 96);
          doc.text('Linha do Tempo', 14, ganttY0);
          const chartX = 14; const chartW = W - 28;
          const labelW = 48; const barAreaX = chartX + labelW; const barAreaW = chartW - labelW;
          const rowH = 7; const headerH = 7;
          let y = ganttY0 + 5;

          doc.setFillColor(15, 52, 96); doc.rect(chartX, y, chartW, headerH, 'F');
          for (const m of this.ganttMonths()) {
            const mx = barAreaX + (m.leftPct / 100) * barAreaW;
            const mw = (m.widthPct / 100) * barAreaW;
            if (m.leftPct > 0) { doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.3); doc.line(mx, y, mx, y + headerH); }
            if (mw > 5) { doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.text(m.label, mx + mw / 2, y + 4.5, { align: 'center' }); }
          }
          y += headerH;

          ativOrdenadas.forEach((a, idx) => {
            doc.setFillColor(idx % 2 === 0 ? 248 : 241, idx % 2 === 0 ? 250 : 245, 255);
            doc.rect(chartX, y, chartW, rowH, 'F');
            doc.setTextColor(30, 41, 59); doc.setFontSize(6); doc.setFont('helvetica', 'normal');
            doc.text(a.nome.length > 16 ? a.nome.slice(0, 15) + '…' : a.nome, chartX + 2, y + rowH / 2 + 1);
            const bs = this.ganttBarStyle(a) as any;
            const bx = barAreaX + (parseFloat(bs.left) / 100) * barAreaW;
            const bw = Math.max((parseFloat(bs.width) / 100) * barAreaW, 1.5);
            const hex = (a.cor || '#4f87f0').replace('#', '');
            doc.setFillColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
            doc.roundedRect(bx, y + 1.5, bw, rowH - 3, 1, 1, 'F');
            if (bw > 10) { doc.setTextColor(255, 255, 255); doc.setFontSize(5); doc.text(`${a.horas}h`, bx + bw / 2, y + rowH / 2 + 1, { align: 'center' }); }
            y += rowH;
          });
          doc.setDrawColor(203, 213, 225); doc.line(chartX, y, chartX + chartW, y);
        }
      }

      // footer
      const total = (doc.internal as any).getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setFillColor(241, 245, 249); doc.rect(0, H - 7, W, 7, 'F');
        doc.setDrawColor(203, 213, 225); doc.line(0, H - 7, W, H - 7);
        doc.setTextColor(100, 116, 139); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text(`Orçamento: ${orc.nome}`, 14, H - 2.5);
        doc.text(`Página ${p} de ${total}`, W - 14, H - 2.5, { align: 'right' });
      }
      doc.save(`orcamento-${orc.nome.toLowerCase().replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.pdf`);
    } finally {
      this.exportandoPDF = false;
    }
  }

  // ── private ───────────────────────────────────────────────────────────────

  private emptyBudgetForm() { return { nome: '', descricao: '' }; }
  private emptyAtividadeForm() { return { nome: '', perfilId: '', horas: 0, dataInicio: '', dataFim: '' }; }
  private emptyTemplateForm(): { nome: string; descricao: string; atividades: any[] } {
    return { nome: '', descricao: '', atividades: [] };
  }
  private emptyTemplateAtvForm() {
    return { nome: '', perfilId: '', horas: 8, offsetDias: 0, duracaoDias: 1 };
  }
  private emptyCloudForm() {
    return { nome: '', servico: '', valorMensal: 0, mesesContratados: 12 };
  }
}
