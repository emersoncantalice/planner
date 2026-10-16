import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';
import { uid } from '../../core/uid';
import { diasUteisEntre, diasUteisNaDuracao } from '../../core/business-days';

/** Atividades de uma frente com os subtotais usados nas telas, no PDF e na planilha. */
interface GrupoFrente {
  /** Nome em minusculas ('' = sem frente); identifica o grupo. */
  chave: string;
  nome: string;
  semFrente: boolean;
  cor: string;
  atividades: any[];
  horas: number;
  custo: number;
  inicio: string;
  fim: string;
}

type Range = { minDate: string; maxDate: string; totalDays: number };

/** Campos da atividade editaveis direto na tabela (duplo clique na celula). */
type CampoInline = 'nome' | 'frente' | 'perfilId' | 'horas' | 'alocacaoPct' | 'dataInicio' | 'dataFim';

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

  /** Escopo da visao: '' = Geral (todas as frentes), SEM_FRENTE ou o nome da frente. */
  frenteSel = '';
  readonly SEM_FRENTE = '__sem_frente__';
  /** No cronograma geral, intercala uma linha-resumo por frente. */
  agruparCronograma = false;

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
  /** Frente aplicada as atividades inseridas; vazio mantem a frente definida no template. */
  injetarFrente = '';

  readonly Number = Number;

  readonly ganttColors = [
    '#4f87f0', '#f59e0b', '#10b981', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
    '#84cc16', '#6366f1',
  ];

  readonly frenteColors = [
    '#2563eb', '#d97706', '#059669', '#dc2626', '#7c3aed',
    '#0891b2', '#ea580c', '#db2777', '#65a30d', '#4f46e5',
  ];
  readonly corSemFrente = '#94a3b8';

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

  selecionarOrcamento(orc: any) {
    this.selectedId = orc.id;
    this.activeTab = 'atividades';
    this.frenteSel = '';
  }

  /** Todas as atividades do orcamento, independente da frente selecionada. */
  atividades(orc?: any): any[] {
    const o = orc ?? this.selectedOrcamento();
    return (o?.atividades ?? []) as any[];
  }

  /** Atividades da visao atual: todas (Geral) ou apenas as da frente selecionada. */
  atividadesEscopo(): any[] {
    const f = this.frenteAtual();
    const todas = this.atividades();
    return f ? todas.filter(a => this.pertenceAFrente(a, f)) : todas;
  }

  atividadesOrdenadas(): any[] {
    return this.ordenarPorData(this.atividadesEscopo());
  }

  ordenarPorData(lista: any[]): any[] {
    return [...lista].sort((a, b) => {
      if (!a.dataInicio) return 1;
      if (!b.dataInicio) return -1;
      return a.dataInicio.localeCompare(b.dataInicio);
    });
  }

  // ── frentes ───────────────────────────────────────────────────────────────

  frenteDe(a: any): string {
    return String(a?.frente ?? '').trim();
  }

  /** Frentes do orcamento (sem repetir por maiusculas/minusculas), em ordem alfabetica. */
  frentes(orc?: any): string[] {
    return this.unicasOrdenadas(this.atividades(orc).map(a => this.frenteDe(a)));
  }

  temFrentes(orc?: any): boolean {
    return this.frentes(orc).length > 0;
  }

  /** Sugestoes do campo Frente: frentes de todos os orcamentos e templates. */
  frentesSugeridas(): string[] {
    const nomes = [
      ...this.frentes(),
      ...this.orcamentos.flatMap(o => (o?.atividades ?? []).map((a: any) => this.frenteDe(a))),
      ...this.templates.flatMap(t => (t?.atividades ?? []).map((a: any) => this.frenteDe(a))),
    ];
    return this.unicasOrdenadas(nomes);
  }

  private unicasOrdenadas(nomes: string[]): string[] {
    const porChave = new Map<string, string>();
    for (const n of nomes) {
      if (n && !porChave.has(n.toLowerCase())) porChave.set(n.toLowerCase(), n);
    }
    return [...porChave.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /** Frente selecionada ainda valida; se ela sumiu do orcamento, volta para Geral. */
  frenteAtual(): string {
    const sel = this.frenteSel;
    if (!sel) return '';
    if (sel === this.SEM_FRENTE) {
      return this.temFrentes() && this.atividades().some(a => !this.frenteDe(a)) ? sel : '';
    }
    return this.frentes().find(f => f.toLowerCase() === sel.toLowerCase()) ?? '';
  }

  emGeral(): boolean {
    return !this.frenteAtual();
  }

  frenteNomeAtual(): string {
    const f = this.frenteAtual();
    return f === this.SEM_FRENTE ? 'Sem frente' : f;
  }

  selecionarFrente(valor: string) {
    this.frenteSel = valor;
  }

  /** Valor de selecao de um grupo (o grupo "Sem frente" usa um marcador proprio). */
  valorFrente(g: GrupoFrente): string {
    return g.semFrente ? this.SEM_FRENTE : g.nome;
  }

  private pertenceAFrente(a: any, frente: string): boolean {
    if (frente === this.SEM_FRENTE) return !this.frenteDe(a);
    return this.frenteDe(a).toLowerCase() === frente.toLowerCase();
  }

  /** Cor fixa por frente dentro do orcamento (ordem alfabetica); sem frente fica cinza. */
  frenteCor(nome: string): string {
    if (!nome) return this.corSemFrente;
    const idx = this.frentes().findIndex(f => f.toLowerCase() === nome.toLowerCase());
    if (idx >= 0) return this.frenteColors[idx % this.frenteColors.length];
    let h = 0;
    for (const ch of nome.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return this.frenteColors[h % this.frenteColors.length];
  }

  frenteCorClara(nome: string): string {
    return this.clarear(this.frenteCor(nome), 0.85);
  }

  /** Agrupa por frente (alfabetica, "Sem frente" por ultimo) com horas, custo e periodo. */
  gruposFrente(ativs: any[] = this.atividades()): GrupoFrente[] {
    const grupos = new Map<string, { nome: string; atividades: any[] }>();
    for (const a of ativs) {
      const nome = this.frenteDe(a);
      const chave = nome.toLowerCase();
      if (!grupos.has(chave)) grupos.set(chave, { nome, atividades: [] });
      grupos.get(chave)!.atividades.push(a);
    }
    return [...grupos.entries()]
      .map(([chave, g]) => {
        const range = this.rangeDe(g.atividades);
        return {
          chave,
          nome: g.nome || 'Sem frente',
          semFrente: !chave,
          cor: this.frenteCor(g.nome),
          atividades: this.ordenarPorData(g.atividades),
          horas: this.totalHoras(g.atividades),
          custo: this.totalPessoas(g.atividades),
          inicio: range?.minDate ?? '',
          fim: range?.maxDate ?? '',
        };
      })
      .sort((a, b) => a.semFrente !== b.semFrente
        ? (a.semFrente ? 1 : -1)
        : a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /** Grupos com ao menos uma atividade datada (os unicos que geram cronograma). */
  gruposComCronograma(): GrupoFrente[] {
    return this.gruposFrente().filter(g => g.inicio && g.fim);
  }

  /** Espacos repetidos colapsados e grafia de uma frente ja existente reaproveitada. */
  private normalizarFrente(valor: string): string {
    const f = String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!f) return '';
    return this.frentesSugeridas().find(x => x.toLowerCase() === f.toLowerCase()) ?? f;
  }

  // ── allocation percent ────────────────────────────────────────────────────

  /** Percentual de dedicacao do profissional na atividade; 100 = periodo integral. */
  alocacaoPct(a: any): number {
    const raw = Number(a?.alocacaoPct);
    if (!isFinite(raw) || raw <= 0) return 100;
    return raw;
  }

  /** Horas base para custo: quando ha datas, apenas dias uteis entram na soma. */
  horasBaseCusto(a: any): number {
    if (a?.dataInicio && a?.dataFim) {
      const dias = this.diasUteis(a.dataInicio, a.dataFim);
      return dias > 0 ? dias * 8 : 0;
    }
    return Number(a?.horas || 0);
  }

  /** Horas que de fato entram no custo: dias uteis do periodo x alocacao. */
  horasEfetivas(a: any): number {
    return this.horasBaseCusto(a) * this.alocacaoPct(a) / 100;
  }

  /** Formata horas efetivas sem casas decimais desnecessarias. */
  formatHoras(h: number): string {
    return `${Number(h.toFixed(2))}h`;
  }

  atividadeCusto(a: any): number {
    return this.horasEfetivas(a) * this.perfilValorHora(a?.perfilId);
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

  pctDe(valor: number, total: number): number {
    return total ? (valor / total) * 100 : 0;
  }

  // ── summary ───────────────────────────────────────────────────────────────

  resumoPorPerfil(ativs: any[] = this.atividadesEscopo()): Array<{ perfilId: string; nome: string; horas: number; valorHora: number; total: number }> {
    const map = new Map<string, { nome: string; horas: number; valorHora: number }>();
    for (const a of ativs) {
      if (!map.has(a.perfilId)) {
        map.set(a.perfilId, { nome: this.perfilNome(a.perfilId), horas: 0, valorHora: this.perfilValorHora(a.perfilId) });
      }
      map.get(a.perfilId)!.horas += this.horasEfetivas(a);
    }
    return Array.from(map.entries())
      .map(([perfilId, v]) => ({ perfilId, ...v, total: v.horas * v.valorHora }))
      .sort((a, b) => b.total - a.total);
  }

  /** Custo de pessoas (horas x valor/hora do perfil) — da visao atual por padrao. */
  totalPessoas(ativs: any[] = this.atividadesEscopo()): number {
    return ativs.reduce((s, a) => s + this.atividadeCusto(a), 0);
  }

  /** Custo do orcamento inteiro: pessoas de todas as frentes + cloud anualizado. */
  totalOrcamento(): number {
    return this.totalPessoas(this.atividades()) + this.totalCloud();
  }

  /** Custo da visao atual: o orcamento inteiro (Geral) ou so as pessoas da frente. */
  totalGeral(): number {
    return this.emGeral() ? this.totalOrcamento() : this.totalPessoas();
  }

  /** Horas efetivas (ja ponderadas pela alocacao de cada atividade). */
  totalHoras(ativs: any[] = this.atividadesEscopo()): number {
    return ativs.reduce((s, a) => s + this.horasEfetivas(a), 0);
  }

  totalCustoBudget(orc: any): number {
    const pessoas = (orc.atividades ?? []).reduce((s: number, a: any) =>
      s + this.atividadeCusto(a), 0);
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
    const range = this.rangeDe(orc?.atividades ?? []);
    return range ? `${this.formatDate(range.minDate)} → ${this.formatDate(range.maxDate)}` : '';
  }

  orcTotalDays(orc: any): number {
    return this.rangeDe(orc?.atividades ?? [])?.totalDays ?? 0;
  }

  // ── gantt ─────────────────────────────────────────────────────────────────

  todayPct(range: Range | null = this.ganttRange()): number | null {
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

  /** Dias uteis (segunda a sexta) do periodo, inclusive as pontas. */
  diasUteis(a: string, b: string): number {
    return diasUteisEntre(a, b);
  }

  /** Periodo coberto pelas atividades datadas da lista. */
  rangeDe(ativs: any[]): Range | null {
    const datadas = ativs.filter(a => a.dataInicio && a.dataFim);
    if (!datadas.length) return null;
    const minDate = datadas.reduce((m, a) => a.dataInicio < m ? a.dataInicio : m, datadas[0].dataInicio);
    const maxDate = datadas.reduce((m, a) => a.dataFim > m ? a.dataFim : m, datadas[0].dataFim);
    return { minDate, maxDate, totalDays: this.dayDiff(minDate, maxDate) + 1 };
  }

  /** Cronograma da visao atual: geral (merge de todas as frentes) ou da frente selecionada. */
  ganttRange(): Range | null {
    return this.rangeDe(this.atividadesEscopo());
  }

  ganttSpanStyle(inicio: string, fim: string, cor: string, range: Range | null = this.ganttRange()): Record<string, string> {
    if (!range || !inicio || !fim) return { display: 'none' };
    const left = (this.dayDiff(range.minDate, inicio) / range.totalDays) * 100;
    const width = ((this.dayDiff(inicio, fim) + 1) / range.totalDays) * 100;
    return { left: `${left.toFixed(2)}%`, width: `${Math.max(0.8, width).toFixed(2)}%`, background: cor };
  }

  ganttBarStyle(a: any, range: Range | null = this.ganttRange()): Record<string, string> {
    return this.ganttSpanStyle(a.dataInicio, a.dataFim, a.cor || '#4f87f0', range);
  }

  ganttMonths(range: Range | null = this.ganttRange()): Array<{ label: string; leftPct: number; widthPct: number }> {
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
        label: this.mesLabel(cur),
        leftPct:  (leftDays  / range.totalDays) * 100,
        widthPct: (widthDays / range.totalDays) * 100,
      });
      cur = next;
    }
    return result;
  }

  private mesLabel(d: Date): string {
    return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/');
  }

  // ── budget CRUD ───────────────────────────────────────────────────────────

  openCreate() {
    this.editingBudgetId = '';
    this.budgetForm = this.emptyBudgetForm();
    this.formOpen = true;
  }

  openEdit(orc: any) {
    this.editingBudgetId = orc.id;
    this.budgetForm = { nome: orc.nome ?? '', descricao: orc.descricao ?? '', dataBase: orc.dataBase ?? '' };
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
      this.create.emit({ ...this.budgetForm, atividades: [], custosCloud: [] });
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
      dataBase: orc.dataBase ?? '',
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
    // Ja nasce na frente que esta sendo vista.
    const f = this.frenteAtual();
    this.atividadeForm.frente = f === this.SEM_FRENTE ? '' : f;
    // Comeca na data base do orcamento (ou logo apos a ultima atividade ja lancada).
    this.atividadeForm.dataInicio = this.sugestaoDataBase();
    this.atividadeFormOpen = true;
  }

  openAtividadeEdit(a: any) {
    this.editingAtividadeId = a.id;
    this.atividadeForm = {
      nome: a.nome ?? '', frente: this.frenteDe(a), perfilId: a.perfilId ?? '', horas: a.horas ?? 0,
      dataInicio: a.dataInicio ?? '', dataFim: a.dataFim ?? '',
      alocacaoPct: this.alocacaoPct(a),
    };
    this.atividadeFormOpen = true;
  }

  recalcHoras() {
    const { dataInicio, dataFim } = this.atividadeForm;
    if (!dataInicio || !dataFim || dataFim < dataInicio) return;
    // Só dias úteis entram na conta: sábado e domingo ficam de fora.
    this.atividadeForm.horas = this.diasUteis(dataInicio, dataFim) * 8;
  }

  /** Horas efetivas do formulario de atividade (horas x alocacao). */
  formHorasEfetivas(): number {
    return this.horasEfetivas(this.atividadeForm);
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
    const form = { ...this.atividadeForm, frente: this.normalizarFrente(this.atividadeForm.frente) };
    const atividades = [...(orc.atividades ?? [])];
    if (this.editingAtividadeId) {
      const idx = atividades.findIndex((a: any) => a.id === this.editingAtividadeId);
      if (idx >= 0) atividades[idx] = { ...atividades[idx], ...form };
    } else {
      atividades.push({
        id: uid(),
        ...form,
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

  // ── edicao inline (duplo clique na tabela de atividades) ──────────────────

  edicaoInline: { id: string; campo: CampoInline } | null = null;
  valorInline: any = '';

  editandoCelula(a: any, campo: CampoInline): boolean {
    const ed = this.edicaoInline;
    return !!ed && ed.id === a?.id && ed.campo === campo;
  }

  /** Com datas, o custo usa dias uteis x 8h; horas so sao digitaveis em atividade sem datas. */
  horasEditaveis(a: any): boolean {
    return !(a?.dataInicio && a?.dataFim);
  }

  iniciarEdicaoInline(a: any, campo: CampoInline, ev: Event) {
    if (campo === 'horas' && !this.horasEditaveis(a)) return;
    this.edicaoInline = { id: a.id, campo };
    this.valorInline = campo === 'frente' ? this.frenteDe(a)
      : campo === 'alocacaoPct' ? this.alocacaoPct(a)
      : (a[campo] ?? '');
    // O campo so existe depois da deteccao de mudancas: foca no proximo tick.
    const celula = ev.currentTarget as HTMLElement | null;
    setTimeout(() => {
      const el = celula?.querySelector('input, select') as HTMLInputElement | null;
      el?.focus();
      if (el && (el.type === 'text' || el.type === 'number')) el.select();
    });
  }

  cancelarEdicaoInline() {
    this.edicaoInline = null;
  }

  /** Enter, blur ou escolha no select: valida, aplica e persiste so se o valor mudou. */
  salvarEdicaoInline() {
    const ed = this.edicaoInline;
    if (!ed) return;
    this.edicaoInline = null;
    const orc = this.selectedOrcamento();
    const atual = this.atividades(orc).find(a => a.id === ed.id);
    if (!orc || !atual) return;
    const mudanca = this.mudancaInline(atual, ed.campo, this.valorInline);
    if (!mudanca) return;
    const atividades = this.atividades(orc).map(a => a.id === ed.id ? { ...a, ...mudanca } : a);
    this.update.emit({ id: orc.id, payload: { ...orc, atividades } });
  }

  /** Campos alterados pela edicao; null quando o valor e invalido ou igual ao atual. */
  private mudancaInline(a: any, campo: CampoInline, valor: any): Record<string, any> | null {
    const vazio = valor === '' || valor == null;
    switch (campo) {
      case 'nome': {
        const v = String(valor ?? '').trim();
        return v && v !== a.nome ? { nome: v } : null;
      }
      case 'frente': {
        const v = this.normalizarFrente(valor);
        return v !== this.frenteDe(a) ? { frente: v } : null;
      }
      case 'perfilId':
        return valor && valor !== a.perfilId ? { perfilId: valor } : null;
      case 'horas': {
        const v = Number(valor);
        return !vazio && isFinite(v) && v >= 0 && v !== Number(a.horas || 0) ? { horas: v } : null;
      }
      case 'alocacaoPct': {
        const v = Math.min(100, Math.max(1, Number(valor)));
        return !vazio && isFinite(v) && v !== this.alocacaoPct(a) ? { alocacaoPct: v } : null;
      }
      case 'dataInicio':
      case 'dataFim': {
        const v = String(valor ?? '');
        if (v === (a[campo] ?? '')) return null;
        const ini = campo === 'dataInicio' ? v : a.dataInicio;
        const fim = campo === 'dataFim' ? v : a.dataFim;
        if (ini && fim && fim < ini) return null;
        // Mesma regra do formulario: datas completas recalculam as horas.
        return ini && fim ? { [campo]: v, horas: this.diasUteis(ini, fim) * 8 } : { [campo]: v };
      }
    }
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
      frente: this.frenteDe(a),
      perfilId: a.perfilId ?? '',
      horas: a.horas ?? 0,
      offsetDias: a.offsetDias ?? 0,
      duracaoDias: a.duracaoDias ?? 1,
      alocacaoPct: this.alocacaoPct(a),
    };
  }

  cancelTemplateAtvForm() {
    this.editingTemplateAtvId = '';
    this.templateAtvForm = this.emptyTemplateAtvForm();
  }

  /**
   * Duracao muda -> horas acompanham (8h/dia sobre dias uteis), como no
   * formulario de atividade. Sem data-ancora, os dias uteis sao estimados;
   * na injecao as horas sao recalculadas sobre as datas reais.
   */
  recalcHorasTemplate() {
    const d = Number(this.templateAtvForm.duracaoDias || 0);
    if (d > 0) this.templateAtvForm.horas = diasUteisNaDuracao(d) * 8;
  }

  submitTemplateAtv() {
    const f = { ...this.templateAtvForm, frente: this.normalizarFrente(this.templateAtvForm.frente) };
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
    return (t?.atividades ?? []).reduce((s: number, a: any) => s + this.horasEfetivas(a), 0);
  }

  templateCusto(t: any): number {
    return (t?.atividades ?? []).reduce((s: number, a: any) => s + this.atividadeCusto(a), 0);
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
        frente: this.frenteDe(a),
        perfilId: a.perfilId,
        horas: Number(a.horas || 0),
        offsetDias: base && a.dataInicio ? this.dayDiff(base, a.dataInicio) : 0,
        duracaoDias: a.dataInicio && a.dataFim ? this.dayDiff(a.dataInicio, a.dataFim) + 1 : 1,
        cor: a.cor || this.ganttColors[i % this.ganttColors.length],
        alocacaoPct: this.alocacaoPct(a),
      })),
    };
    this.cancelTemplateAtvForm();
  }

  // ── template injection ────────────────────────────────────────────────────

  openInjetar() {
    if (!this.selectedOrcamento()) return;
    this.injetarTemplateId = this.templates[0]?.id ?? '';
    this.injetarDataBase = this.sugestaoDataBase();
    const f = this.frenteAtual();
    this.injetarFrente = f === this.SEM_FRENTE ? '' : f;
    this.injetarModalOpen = true;
  }

  closeInjetar() {
    this.injetarModalOpen = false;
    this.injetarTemplateId = '';
    this.injetarFrente = '';
  }

  /** Comeca logo depois da ultima atividade da visao atual; senao, a data base do orcamento. */
  private sugestaoDataBase(): string {
    const range = this.ganttRange();
    if (range) return this.addDays(range.maxDate, 1);
    return this.selectedOrcamento()?.dataBase || this.hoje();
  }

  private hoje(): string {
    return new Date().toISOString().slice(0, 10);
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
    const frenteFixa = this.normalizarFrente(this.injetarFrente);
    for (const a of (tpl.atividades ?? []) as any[]) {
      const offset = Number(a.offsetDias || 0);
      const duracao = Math.max(1, Number(a.duracaoDias || 1));
      const dataInicio = base ? this.addDays(base, offset) : '';
      const dataFim = dataInicio ? this.addDays(dataInicio, duracao - 1) : '';
      atividades.push({
        id: uid(),
        nome: a.nome,
        frente: frenteFixa || this.normalizarFrente(a.frente),
        perfilId: a.perfilId,
        horas: Number(a.horas || 0) || this.diasUteis(dataInicio, dataFim) * 8,
        dataInicio,
        dataFim,
        cor: a.cor || this.ganttColors[atividades.length % this.ganttColors.length],
        alocacaoPct: this.alocacaoPct(a),
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

  // ── export menu ───────────────────────────────────────────────────────────

  exportMenuOpen = false;

  private nomeArquivo(orc: any, ext: string): string {
    const slug = String(orc?.nome ?? 'orcamento').toLowerCase()
      .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
    return `orcamento-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  }

  private hexRgb(hex: string): [number, number, number] {
    let h = String(hex || '#4f87f0').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }

  /** Mistura a cor com branco (f = 0 mantem, f = 1 vira branco). */
  private clarear(hex: string, f: number): string {
    const mix = (c: number) => Math.round(c + (255 - c) * f);
    return '#' + this.hexRgb(hex).map(c => mix(c).toString(16).padStart(2, '0')).join('');
  }

  // ── PDF export ────────────────────────────────────────────────────────────

  exportandoPDF = false;
  pdfModalOpen = false;
  pdfCronoGeral = true;
  pdfCronoFrentes = false;

  /** Ha cronograma exportavel? (atividades com inicio e fim, em qualquer frente) */
  temCronograma(): boolean {
    return !!this.rangeDe(this.atividades());
  }

  /** Antes de gerar, pergunta quais cronogramas vao no PDF (geral e/ou por frente). */
  exportarPDF() {
    const orc = this.selectedOrcamento();
    if (!orc || this.exportandoPDF) return;
    if (!this.temCronograma()) { this.gerarPDF({ geral: false, frentes: false }); return; }
    this.pdfCronoGeral = true;
    this.pdfCronoFrentes = this.temFrentes();
    this.pdfModalOpen = true;
  }

  confirmarExportPDF() {
    this.pdfModalOpen = false;
    this.gerarPDF({ geral: this.pdfCronoGeral, frentes: this.pdfCronoFrentes && this.temFrentes() });
  }

  /** O PDF sempre traz o orcamento inteiro, dividido por frente, independente da visao atual. */
  private async gerarPDF(cronogramas: { geral: boolean; frentes: boolean }) {
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

      const todas = this.atividades(orc);
      const grupos = this.gruposFrente(todas);
      const comFrentes = this.temFrentes(orc);
      const totalPessoas = this.totalPessoas(todas);
      const totalCloud = this.totalCloudDe(orc);
      const totalOrc = totalPessoas + totalCloud;
      const horasTotal = this.formatHoras(this.totalHoras(todas));
      const resumo = this.resumoPorPerfil(todas);
      const pct = (v: number) => `${this.pctDe(v, totalOrc).toFixed(1)}%`;

      /** Titulo de secao abaixo da ultima tabela; quebra a pagina se nao couber. */
      const tituloSecao = (texto: string): number => {
        let y = (doc as any).lastAutoTable.finalY + 8;
        if (y > H - 30) { doc.addPage(); y = 16; }
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 52, 96);
        doc.text(texto, 14, y);
        return y + 4;
      };

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
      const kpis: { label: string; value: string; color: [number, number, number]; money?: boolean }[] = [
        { label: 'Atividades',      value: String(todas.length),           color: [30, 64, 175] },
        ...(comFrentes ? [{ label: 'Frentes', value: String(this.frentes(orc).length), color: [21, 94, 117] as [number, number, number] }] : []),
        { label: 'Total de Horas',  value: horasTotal,                     color: [5, 122, 85] },
        { label: 'Perfis',          value: String(resumo.length),          color: [109, 40, 217] },
        { label: 'Custo Total',     value: this.currency(totalOrc),        color: [161, 65, 0], money: true },
      ];
      const kpiY = 30; const kpiW = (W - 28 - 3 * (kpis.length - 1)) / kpis.length;
      kpis.forEach((k, i) => {
        const x = 14 + i * (kpiW + 3);
        doc.setFillColor(...k.color);
        doc.roundedRect(x, kpiY, kpiW, 15, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(k.money ? 9 : 13); doc.setFont('helvetica', 'bold');
        doc.text(k.value, x + kpiW / 2, kpiY + 7, { align: 'center' });
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text(k.label, x + kpiW / 2, kpiY + 12.5, { align: 'center' });
      });

      // activities table — agrupada por frente, com subtotal no cabecalho de cada grupo
      const linhaAtv = (a: any) => {
        const dur = a.dataInicio && a.dataFim ? String(this.dayDiff(a.dataInicio, a.dataFim) + 1) : '—';
        return [a.nome, this.perfilNome(a.perfilId), `${a.horas}h`, `${this.alocacaoPct(a)}%`,
                this.formatHoras(this.horasEfetivas(a)), this.formatDate(a.dataInicio),
                this.formatDate(a.dataFim), dur, this.currency(this.atividadeCusto(a))];
      };
      const corpoAtividades: any[] = comFrentes
        ? grupos.flatMap(g => {
            const [r, gg, b] = this.hexRgb(this.clarear(g.cor, 0.82));
            return [
              [{
                content: `${g.nome}   ·   ${g.atividades.length} atividade(s)   ·   ${this.formatHoras(g.horas)}   ·   ${this.currency(g.custo)}`,
                colSpan: 9,
                styles: { fillColor: [r, gg, b], textColor: [15, 52, 96], fontStyle: 'bold', fontSize: 7.5 },
              }],
              ...g.atividades.map(linhaAtv),
            ];
          })
        : this.ordenarPorData(todas).map(linhaAtv);
      autoTable(doc, {
        startY: kpiY + 19,
        head: [['Atividade', 'Perfil', 'Horas', 'Aloc.', 'Horas efet.', 'Início', 'Fim', 'Duração (d)', 'Custo']],
        body: corpoAtividades,
        theme: 'striped',
        headStyles: { fillColor: [15, 52, 96], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 34 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 13, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 20, halign: 'center' }, 6: { cellWidth: 20, halign: 'center' }, 7: { cellWidth: 17, halign: 'center' }, 8: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });

      // rodape com pessoas + cloud = total geral, comum aos resumos
      const rodapeTotais = (cols: number, colHoras: number): string[][] => {
        const linha = (rotulo: string, horas: string, valor: string, extra = '') => {
          const l = Array(cols).fill('');
          l[0] = rotulo; l[colHoras] = horas; l[cols - 2] = valor; l[cols - 1] = extra;
          return l;
        };
        const foot = [linha('Subtotal pessoas', horasTotal, this.currency(totalPessoas), pct(totalPessoas))];
        if (totalCloud) foot.push(linha('Cloud (anualizado)', '—', this.currency(totalCloud), pct(totalCloud)));
        foot.push(linha('Total Geral', horasTotal, this.currency(totalOrc), '100%'));
        return foot;
      };

      // frente summary
      if (comFrentes) {
        const yFrente = tituloSecao('Resumo por Frente');
        autoTable(doc, {
          startY: yFrente,
          head: [['Frente', 'Atividades', 'Início', 'Fim', 'Horas efetivas', 'Custo', '% do total']],
          body: grupos.map(g => [g.nome, String(g.atividades.length), this.formatDate(g.inicio), this.formatDate(g.fim),
                                 this.formatHoras(g.horas), this.currency(g.custo), pct(g.custo)]),
          foot: rodapeTotais(7, 4),
          theme: 'grid',
          headStyles: { fillColor: [21, 94, 117], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 7.5 },
          footStyles: { fillColor: [236, 254, 255], textColor: [21, 94, 117], fontStyle: 'bold', fontSize: 8 },
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'right' } },
          didParseCell: (data: any) => {
            // bolinha de cor da frente no nome
            if (data.section === 'body' && data.column.index === 0) data.cell.styles.cellPadding = { left: 5, top: 1.5, bottom: 1.5, right: 2 };
          },
          didDrawCell: (data: any) => {
            if (data.section !== 'body' || data.column.index !== 0) return;
            const g = grupos[data.row.index];
            if (!g) return;
            doc.setFillColor(...this.hexRgb(g.cor));
            doc.circle(data.cell.x + 2.4, data.cell.y + data.cell.height / 2, 1, 'F');
          },
          margin: { left: 14, right: 14 },
        });
      }

      // profile summary
      const y1 = tituloSecao('Resumo por Perfil');
      autoTable(doc, {
        startY: y1,
        head: [['Perfil', 'Horas efetivas', 'Valor/hora', 'Total', '% do total']],
        body: resumo.map(r => [r.nome, this.formatHoras(r.horas), this.currency(r.valorHora), this.currency(r.total), pct(r.total)]),
        foot: rodapeTotais(5, 1),
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 52, 96], fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });

      // cloud costs
      const cloud = this.custosCloud(orc);
      if (cloud.length) {
        const yCloud = tituloSecao('Custos de Cloud');
        autoTable(doc, {
          startY: yCloud,
          head: [['Descrição', 'Serviço', 'Valor mensal', 'Meses', 'Total']],
          body: cloud.map(c => [
            c.nome, c.servico || '—', this.currency(Number(c.valorMensal || 0)),
            String(c.mesesContratados ?? 12), this.currency(this.cloudTotalItem(c)),
          ]),
          foot: [['Total', '', `${this.currency(this.totalCloudMensal())}/mês`, '', this.currency(totalCloud)]],
          theme: 'grid',
          headStyles: { fillColor: [21, 94, 117], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 7.5 },
          footStyles: { fillColor: [236, 254, 255], textColor: [21, 94, 117], fontStyle: 'bold', fontSize: 8 },
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        });
      }

      // cronogramas (opcionais, escolhidos antes de gerar), cada um numa pagina
      if (cronogramas.geral) {
        this.desenharCronogramaPDF(doc, 'Cronograma geral',
          comFrentes ? `${orc.nome} · todas as frentes` : orc.nome, todas, comFrentes);
      }
      if (cronogramas.frentes && comFrentes) {
        for (const g of grupos) {
          this.desenharCronogramaPDF(doc, `Cronograma — ${g.nome}`,
            `${orc.nome} · ${g.atividades.length} atividade(s) · ${this.currency(g.custo)}`, g.atividades, false);
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
      doc.save(this.nomeArquivo(orc, 'pdf'));
    } finally {
      this.exportandoPDF = false;
    }
  }

  /**
   * Uma pagina de cronograma para a lista de atividades. Com `marcarFrente`,
   * cada linha ganha uma faixa na cor da sua frente (usado no cronograma geral).
   */
  private desenharCronogramaPDF(doc: any, titulo: string, subtitulo: string, ativs: any[], marcarFrente: boolean) {
    const range = this.rangeDe(ativs);
    const lista = this.ordenarPorData(ativs).filter(a => a.dataInicio && a.dataFim);
    if (!range || !lista.length) return;
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.addPage();

    doc.setFillColor(15, 52, 96);
    doc.rect(0, 0, W, 22, 'F');
    doc.setFillColor(29, 99, 218);
    doc.rect(0, 18, W, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(titulo, 14, 10);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(subtitulo, 14, 16);
    doc.text(`${this.formatDate(range.minDate)} → ${this.formatDate(range.maxDate)} · ${range.totalDays} dia(s)`,
             W - 14, 12, { align: 'right' });

    const chartX = 14; const chartW = W - 28;
    const labelW = 55; const barAreaX = chartX + labelW; const barAreaW = chartW - labelW;
    const headerH = 8;
    const legendaH = marcarFrente ? 8 : 0;
    // Altura de linha ajustada para caber todas as atividades na pagina.
    const disponivel = H - 34 - headerH - 12 - legendaH;
    const rowH = Math.max(4, Math.min(9, disponivel / lista.length));
    const meses = this.ganttMonths(range);
    let y = 34;

    doc.setFillColor(15, 52, 96); doc.rect(chartX, y, chartW, headerH, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('Atividade', chartX + 2, y + headerH / 2 + 1.5);
    for (const m of meses) {
      const mx = barAreaX + (m.leftPct / 100) * barAreaW;
      const mw = (m.widthPct / 100) * barAreaW;
      if (m.leftPct > 0) { doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.3); doc.line(mx, y, mx, y + headerH); }
      if (mw > 5) { doc.setTextColor(255, 255, 255); doc.setFontSize(6.5); doc.text(m.label, mx + mw / 2, y + headerH / 2 + 1.5, { align: 'center' }); }
    }
    y += headerH;

    const gridTop = y;
    lista.forEach((a, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 248 : 241, idx % 2 === 0 ? 250 : 245, 255);
      doc.rect(chartX, y, chartW, rowH, 'F');
      if (marcarFrente) {
        doc.setFillColor(...this.hexRgb(this.frenteCor(this.frenteDe(a))));
        doc.rect(chartX, y, 1.2, rowH, 'F');
      }
      const rgb = this.hexRgb(a.cor || '#4f87f0');
      doc.setFillColor(...rgb);
      doc.circle(chartX + 3.5, y + rowH / 2, Math.min(1.2, rowH / 5), 'F');
      doc.setTextColor(30, 41, 59); doc.setFontSize(Math.min(6.5, rowH - 1.5)); doc.setFont('helvetica', 'normal');
      const nome = a.nome.length > 30 ? a.nome.slice(0, 29) + '…' : a.nome;
      doc.text(nome, chartX + 6.5, y + rowH / 2 + 1);
      doc.setTextColor(100, 116, 139);
      doc.text(`${this.alocacaoPct(a)}%`, barAreaX - 3, y + rowH / 2 + 1, { align: 'right' });

      const bs = this.ganttBarStyle(a, range) as any;
      const bx = barAreaX + (parseFloat(bs.left) / 100) * barAreaW;
      const bw = Math.max((parseFloat(bs.width) / 100) * barAreaW, 1.5);
      doc.setFillColor(...rgb);
      doc.roundedRect(bx, y + rowH * 0.2, bw, rowH * 0.6, 0.8, 0.8, 'F');
      if (bw > 12 && rowH >= 5) {
        doc.setTextColor(255, 255, 255); doc.setFontSize(Math.min(5.5, rowH - 2));
        doc.text(this.formatHoras(this.horasEfetivas(a)), bx + bw / 2, y + rowH / 2 + 1, { align: 'center' });
      }
      y += rowH;
    });

    // linhas de mes por cima das barras, para leitura vertical
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2);
    for (const m of meses) {
      if (m.leftPct <= 0) continue;
      const mx = barAreaX + (m.leftPct / 100) * barAreaW;
      doc.line(mx, gridTop, mx, y);
    }
    const hojePct = this.todayPct(range);
    if (hojePct !== null) {
      const tx = barAreaX + (hojePct / 100) * barAreaW;
      doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.4);
      doc.line(tx, gridTop, tx, y);
    }
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2);
    doc.line(chartX, y, chartX + chartW, y);

    // legenda das frentes (cor da faixa a esquerda de cada linha)
    if (marcarFrente) {
      let lx = chartX; const ly = y + 5;
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
      for (const g of this.gruposFrente(ativs)) {
        const rotulo = `${g.nome} (${this.currency(g.custo)})`;
        const largura = doc.getTextWidth(rotulo) + 7;
        if (lx + largura > chartX + chartW) break;
        doc.setFillColor(...this.hexRgb(g.cor));
        doc.rect(lx, ly - 2.2, 3, 3, 'F');
        doc.setTextColor(71, 85, 105);
        doc.text(rotulo, lx + 4, ly);
        lx += largura;
      }
    }
  }

  // ── Planilha (xlsx) ───────────────────────────────────────────────────────

  exportandoPlanilha = false;

  /**
   * Planilha do orcamento inteiro: Resumo (por frente, por perfil e frente x perfil),
   * Atividades (tabela filtravel com formulas), Cronograma (grade semanal agrupada
   * por frente) e Cloud. Os totais por frente sao SOMASE sobre a aba Atividades,
   * entao editar horas/valores la recalcula o resumo.
   */
  async exportarPlanilha() {
    const orc = this.selectedOrcamento();
    if (!orc || this.exportandoPlanilha) return;
    this.exportandoPlanilha = true;
    try {
      const mod: any = await import('xlsx-js-style');
      const XLSX = mod.default ?? mod;
      const wb = XLSX.utils.book_new();

      const todas = this.atividades(orc);
      const grupos = this.gruposFrente(todas);
      const comFrentes = this.temFrentes(orc);
      const cloud = this.custosCloud(orc);
      const totalPessoas = this.totalPessoas(todas);
      const totalCloud = this.totalCloudDe(orc);
      const totalOrc = totalPessoas + totalCloud;

      // ── estilos e celulas ──
      const rgb = (hex: string) => hex.replace('#', '').toUpperCase();
      const thin = { style: 'thin', color: { rgb: 'C5D3E8' } };
      const border = { top: thin, bottom: thin, left: thin, right: thin };
      const S = {
        title:     { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F3460' } }, alignment: { vertical: 'center' } },
        section:   { font: { bold: true, sz: 11, color: { rgb: '0F3460' } } },
        label:     { font: { bold: true, color: { rgb: '4A6A9A' } } },
        info:      { alignment: { horizontal: 'left' } },
        head:      { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E40AF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border },
        text:      { border },
        num:       { border, alignment: { horizontal: 'right' } },
        center:    { border, alignment: { horizontal: 'center' } },
        totText:   { font: { bold: true }, fill: { fgColor: { rgb: 'EEF4FF' } }, border },
        totNum:    { font: { bold: true }, fill: { fgColor: { rgb: 'EEF4FF' } }, border, alignment: { horizontal: 'right' } },
        totCenter: { font: { bold: true }, fill: { fgColor: { rgb: 'EEF4FF' } }, border, alignment: { horizontal: 'center' } },
        grText:    { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F3460' } }, border },
        grNum:     { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F3460' } }, border, alignment: { horizontal: 'right' } },
      };
      const Z_BRL = '"R$" #,##0.00';
      const Z_HORAS = '#,##0.00';
      const Z_INT = '0';
      const Z_PCT = '0.0%';
      const Z_ALOC = '0%';
      const Z_DATA = 'dd/mm/yyyy';

      const serial = (iso: string) => {
        const [y, m, d] = iso.split('-').map(Number);
        return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
      };
      const fin = (v: number) => Number.isFinite(v) ? Number(v.toFixed(6)) : 0;
      const txt = (v: any, s: any = S.text) => ({ t: 's', v: v == null ? '' : String(v), s });
      const num = (v: number, z: string, s: any = S.num) => ({ t: 'n', v: fin(v), z, s });
      const fx = (f: string, v: number, z: string, s: any = S.num) => ({ t: 'n', f, v: fin(v), z, s });
      const data = (iso: string, s: any = S.center) => iso ? { t: 'n', v: serial(iso), z: Z_DATA, s } : txt('—', s);
      const col = (c: number) => XLSX.utils.encode_col(c);
      const cel = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
      const abs = (r: number, c: number) => `$${col(c)}$${r + 1}`;

      const novaAba = () => {
        const cells: Record<string, any> = {};
        const merges: any[] = [];
        let maxR = 0; let maxC = 0;
        return {
          cells, merges,
          set(r: number, c: number, cell: any) { cells[cel(r, c)] = cell; maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); },
          merge(r: number, c0: number, c1: number) { if (c1 > c0) merges.push({ s: { r, c: c0 }, e: { r, c: c1 } }); },
          fechar(cols: any[]) {
            cells['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
            cells['!merges'] = merges;
            cells['!cols'] = cols;
            return cells;
          },
        };
      };

      // ── Aba Atividades (montada primeiro: o resumo referencia suas linhas) ──
      const AT = novaAba();
      const C = { frente: 0, nome: 1, perfil: 2, area: 3, ini: 4, fim: 5, dur: 6, uteis: 7, horas: 8, aloc: 9, efet: 10, vh: 11, custo: 12 };
      ['Frente', 'Atividade', 'Perfil', 'Área', 'Início', 'Fim', 'Duração (dias)', 'Dias úteis',
       'Horas (período)', 'Alocação', 'Horas efetivas', 'Valor/hora', 'Custo']
        .forEach((h, c) => AT.set(0, c, txt(h, S.head)));
      let r = 1;
      for (const g of grupos) {
        for (const a of g.atividades) {
          const hb = this.horasBaseCusto(a);
          const aloc = this.alocacaoPct(a) / 100;
          const vh = this.perfilValorHora(a.perfilId);
          const datada = a.dataInicio && a.dataFim;
          AT.set(r, C.frente, txt(g.nome));
          AT.set(r, C.nome, txt(a.nome));
          AT.set(r, C.perfil, txt(this.perfilNome(a.perfilId)));
          AT.set(r, C.area, txt(this.perfilArea(a.perfilId)));
          AT.set(r, C.ini, data(a.dataInicio));
          AT.set(r, C.fim, data(a.dataFim));
          AT.set(r, C.dur, datada ? num(this.dayDiff(a.dataInicio, a.dataFim) + 1, Z_INT, S.center) : txt('—', S.center));
          AT.set(r, C.uteis, datada ? num(this.diasUteis(a.dataInicio, a.dataFim), Z_INT, S.center) : txt('—', S.center));
          AT.set(r, C.horas, num(hb, Z_HORAS));
          AT.set(r, C.aloc, num(aloc, Z_ALOC, S.center));
          AT.set(r, C.efet, fx(`${cel(r, C.horas)}*${cel(r, C.aloc)}`, hb * aloc, Z_HORAS));
          AT.set(r, C.vh, num(vh, Z_BRL));
          AT.set(r, C.custo, fx(`${cel(r, C.efet)}*${cel(r, C.vh)}`, hb * aloc * vh, Z_BRL));
          r++;
        }
      }
      const atvIni = 1; const atvFim = Math.max(1, r - 1);
      const faixa = (c: number) => `Atividades!${abs(atvIni, c)}:${abs(atvFim, c)}`;
      // SUBTOTAL ignora linhas ocultas: filtrando uma frente, o total vira o da frente.
      const rTotAt = r;
      for (let c = 0; c <= C.custo; c++) AT.set(rTotAt, c, txt('', S.totText));
      AT.set(rTotAt, 0, txt('Total (linhas visíveis)', S.totText));
      AT.merge(rTotAt, 0, 3);
      AT.set(rTotAt, C.horas, fx(`SUBTOTAL(109,${cel(atvIni, C.horas)}:${cel(atvFim, C.horas)})`,
        todas.reduce((s, a) => s + this.horasBaseCusto(a), 0), Z_HORAS, S.totNum));
      AT.set(rTotAt, C.efet, fx(`SUBTOTAL(109,${cel(atvIni, C.efet)}:${cel(atvFim, C.efet)})`, this.totalHoras(todas), Z_HORAS, S.totNum));
      AT.set(rTotAt, C.custo, fx(`SUBTOTAL(109,${cel(atvIni, C.custo)}:${cel(atvFim, C.custo)})`, totalPessoas, Z_BRL, S.totNum));
      const wsAt = AT.fechar([
        { wch: 20 }, { wch: 34 }, { wch: 24 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 9 },
        { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
      ]);
      wsAt['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: atvFim, c: C.custo } }) };

      // ── Aba Cloud ──
      let wsCloud: any = null;
      let refTotalCloud = '';
      if (cloud.length) {
        const CL = novaAba();
        ['Descrição', 'Serviço', 'Valor mensal', 'Meses', 'Total'].forEach((h, c) => CL.set(0, c, txt(h, S.head)));
        cloud.forEach((c, i) => {
          const rr = i + 1;
          CL.set(rr, 0, txt(c.nome));
          CL.set(rr, 1, txt(c.servico || '—'));
          CL.set(rr, 2, num(Number(c.valorMensal || 0), Z_BRL));
          CL.set(rr, 3, num(Number(c.mesesContratados ?? 12), Z_INT, S.center));
          CL.set(rr, 4, fx(`${cel(rr, 2)}*${cel(rr, 3)}`, this.cloudTotalItem(c), Z_BRL));
        });
        const rt = cloud.length + 1;
        CL.set(rt, 0, txt('Total', S.totText));
        CL.set(rt, 1, txt('', S.totText));
        CL.set(rt, 2, fx(`SUM(${cel(1, 2)}:${cel(rt - 1, 2)})`, cloud.reduce((s, c) => s + Number(c.valorMensal || 0), 0), Z_BRL, S.totNum));
        CL.set(rt, 3, txt('', S.totText));
        CL.set(rt, 4, fx(`SUM(${cel(1, 4)}:${cel(rt - 1, 4)})`, totalCloud, Z_BRL, S.totNum));
        refTotalCloud = `Cloud!${abs(rt, 4)}`;
        wsCloud = CL.fechar([{ wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 16 }]);
      }

      // ── Aba Resumo ──
      const RS = novaAba();
      let R = 0;
      RS.set(R, 0, txt(`Orçamento: ${orc.nome}`, S.title));
      for (let c = 1; c <= 6; c++) RS.set(R, c, txt('', S.title));
      RS.merge(R, 0, 6); R++;
      const range = this.rangeDe(todas);
      const agora = new Date();
      const info: Array<[string, any]> = [
        ['Descrição', txt(orc.descricao || '—', S.info)],
        ['Data de início', orc.dataBase ? { ...data(orc.dataBase, S.info) } : txt('—', S.info)],
        ['Período', txt(range ? `${this.formatDate(range.minDate)} → ${this.formatDate(range.maxDate)} (${range.totalDays} dias)` : '—', S.info)],
        ['Gerado em', txt(`${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, S.info)],
      ];
      for (const [rotulo, valor] of info) {
        RS.set(R, 0, txt(rotulo, S.label));
        RS.set(R, 1, valor);
        RS.merge(R, 1, 6);
        R++;
      }
      R++;

      // Resumo por frente: contagem, horas e custo via CONT.SE/SOMASE na aba Atividades.
      RS.set(R++, 0, txt(comFrentes ? 'Resumo por Frente' : 'Resumo', S.section));
      ['Frente', 'Atividades', 'Início', 'Fim', 'Horas efetivas', 'Custo', '% do total']
        .forEach((h, c) => RS.set(R, c, txt(h, S.head)));
      R++;
      const rFrIni = R;
      const linhasFrente: number[] = [];
      const rTotalGeral = rFrIni + grupos.length + (cloud.length ? 2 : 1);
      const pctFx = (rr: number, v: number, s: any = S.num) =>
        fx(`IF(${abs(rTotalGeral, 5)}=0,0,${cel(rr, 5)}/${abs(rTotalGeral, 5)})`, totalOrc ? v / totalOrc : 0, Z_PCT, s);
      const temLinhasAt = todas.length > 0;
      for (const g of grupos) {
        RS.set(R, 0, txt(g.nome, { ...S.text, font: { bold: true, color: { rgb: rgb(g.cor) } } }));
        RS.set(R, 1, temLinhasAt
          ? fx(`COUNTIF(${faixa(C.frente)},${cel(R, 0)})`, g.atividades.length, Z_INT, S.center)
          : num(0, Z_INT, S.center));
        RS.set(R, 2, data(g.inicio));
        RS.set(R, 3, data(g.fim));
        RS.set(R, 4, fx(`SUMIF(${faixa(C.frente)},${cel(R, 0)},${faixa(C.efet)})`, g.horas, Z_HORAS));
        RS.set(R, 5, fx(`SUMIF(${faixa(C.frente)},${cel(R, 0)},${faixa(C.custo)})`, g.custo, Z_BRL));
        RS.set(R, 6, pctFx(R, g.custo));
        linhasFrente.push(R);
        R++;
      }
      const rFrFim = R - 1;
      const soma = (c: number) => linhasFrente.length ? `SUM(${cel(rFrIni, c)}:${cel(rFrFim, c)})` : '0';
      const rSubPessoas = R;
      RS.set(R, 0, txt('Subtotal pessoas', S.totText));
      RS.set(R, 1, fx(soma(1), todas.length, Z_INT, S.totCenter));
      RS.set(R, 2, data(range?.minDate ?? '', S.totCenter));
      RS.set(R, 3, data(range?.maxDate ?? '', S.totCenter));
      RS.set(R, 4, fx(soma(4), this.totalHoras(todas), Z_HORAS, S.totNum));
      RS.set(R, 5, fx(soma(5), totalPessoas, Z_BRL, S.totNum));
      RS.set(R, 6, pctFx(R, totalPessoas, S.totNum));
      R++;
      let rCloud = -1;
      if (cloud.length) {
        rCloud = R;
        RS.set(R, 0, txt('Cloud (anualizado)', S.totText));
        for (let c = 1; c <= 4; c++) RS.set(R, c, txt('', S.totText));
        RS.set(R, 5, fx(refTotalCloud, totalCloud, Z_BRL, S.totNum));
        RS.set(R, 6, pctFx(R, totalCloud, S.totNum));
        R++;
      }
      // R === rTotalGeral
      RS.set(R, 0, txt('Total Geral', S.grText));
      RS.set(R, 1, txt('', S.grText));
      RS.set(R, 2, txt('', S.grText));
      RS.set(R, 3, txt('', S.grText));
      RS.set(R, 4, fx(cel(rSubPessoas, 4), this.totalHoras(todas), Z_HORAS, S.grNum));
      RS.set(R, 5, fx(rCloud >= 0 ? `${cel(rSubPessoas, 5)}+${cel(rCloud, 5)}` : cel(rSubPessoas, 5), totalOrc, Z_BRL, S.grNum));
      RS.set(R, 6, fx(`IF(${cel(R, 5)}=0,0,1)`, totalOrc ? 1 : 0, Z_PCT, S.grNum));
      R += 2;

      // Resumo por perfil (orcamento inteiro).
      RS.set(R++, 0, txt('Resumo por Perfil', S.section));
      ['Perfil', 'Área', 'Horas efetivas', 'Valor/hora', 'Total', '% do total']
        .forEach((h, c) => RS.set(R, c, txt(h, S.head)));
      R++;
      const resumo = this.resumoPorPerfil(todas);
      const rPfIni = R;
      for (const p of resumo) {
        RS.set(R, 0, txt(p.nome));
        RS.set(R, 1, txt(this.perfilArea(p.perfilId)));
        RS.set(R, 2, num(p.horas, Z_HORAS));
        RS.set(R, 3, num(p.valorHora, Z_BRL));
        RS.set(R, 4, fx(`${cel(R, 2)}*${cel(R, 3)}`, p.total, Z_BRL));
        RS.set(R, 5, fx(`IF(${abs(rTotalGeral, 5)}=0,0,${cel(R, 4)}/${abs(rTotalGeral, 5)})`, totalOrc ? p.total / totalOrc : 0, Z_PCT));
        R++;
      }
      if (resumo.length) {
        RS.set(R, 0, txt('Subtotal pessoas', S.totText));
        RS.set(R, 1, txt('', S.totText));
        RS.set(R, 2, fx(`SUM(${cel(rPfIni, 2)}:${cel(R - 1, 2)})`, this.totalHoras(todas), Z_HORAS, S.totNum));
        RS.set(R, 3, txt('', S.totText));
        RS.set(R, 4, fx(`SUM(${cel(rPfIni, 4)}:${cel(R - 1, 4)})`, totalPessoas, Z_BRL, S.totNum));
        RS.set(R, 5, fx(`IF(${abs(rTotalGeral, 5)}=0,0,${cel(R, 4)}/${abs(rTotalGeral, 5)})`, totalOrc ? totalPessoas / totalOrc : 0, Z_PCT, S.totNum));
        R++;
      }

      // Custo por perfil x frente (so faz sentido havendo frentes).
      let colsMatriz = 0;
      if (comFrentes && resumo.length) {
        R++;
        RS.set(R++, 0, txt('Custo por Perfil e Frente', S.section));
        RS.set(R, 0, txt('Perfil', S.head));
        grupos.forEach((g, i) => RS.set(R, i + 1, txt(g.nome, S.head)));
        const cTot = grupos.length + 1;
        RS.set(R, cTot, txt('Total', S.head));
        colsMatriz = cTot + 1;
        R++;
        const rMxIni = R;
        for (const p of resumo) {
          RS.set(R, 0, txt(p.nome));
          grupos.forEach((g, i) => {
            const v = this.totalPessoas(g.atividades.filter(a => a.perfilId === p.perfilId));
            RS.set(R, i + 1, v ? num(v, Z_BRL) : txt('', S.num));
          });
          RS.set(R, cTot, fx(`SUM(${cel(R, 1)}:${cel(R, cTot - 1)})`, p.total, Z_BRL, { ...S.num, font: { bold: true } }));
          R++;
        }
        RS.set(R, 0, txt('Total', S.totText));
        grupos.forEach((g, i) => RS.set(R, i + 1, fx(`SUM(${cel(rMxIni, i + 1)}:${cel(R - 1, i + 1)})`, g.custo, Z_BRL, S.totNum)));
        RS.set(R, cTot, fx(`SUM(${cel(rMxIni, cTot)}:${cel(R - 1, cTot)})`, totalPessoas, Z_BRL, S.totNum));
        R++;
      }
      const largurasResumo = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 17 }, { wch: 12 }];
      for (let c = largurasResumo.length; c < colsMatriz; c++) largurasResumo.push({ wch: 16 });
      const wsResumo = RS.fechar(largurasResumo);

      // ── Aba Cronograma (grade semanal; mensal para periodos longos) ──
      let wsCrono: any = null;
      if (range) {
        const CR = novaAba();
        const FIX = 5; // Atividade | Perfil | Inicio | Fim | Custo
        const semanal = range.totalDays <= 7 * 104;
        const periodos: Array<{ ini: string; fim: string; label: string; grupo: string }> = [];
        if (semanal) {
          const dow = (new Date(range.minDate + 'T00:00:00').getDay() + 6) % 7; // 0 = segunda
          for (let ini = this.addDays(range.minDate, -dow); ini <= range.maxDate; ini = this.addDays(ini, 7)) {
            periodos.push({ ini, fim: this.addDays(ini, 6), label: `${ini.slice(8, 10)}/${ini.slice(5, 7)}`,
                            grupo: this.mesLabel(new Date(ini + 'T00:00:00')) });
          }
        } else {
          for (let ini = range.minDate.slice(0, 8) + '01'; ini <= range.maxDate;) {
            const d = new Date(ini + 'T00:00:00');
            const prox = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            const proxIso = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}-01`;
            periodos.push({ ini, fim: this.addDays(proxIso, -1), label: this.mesLabel(d), grupo: String(d.getFullYear()) });
            ini = proxIso;
          }
        }

        // Linha 0: faixa de meses (ou anos); linha 1: cabecalhos + inicio de cada periodo.
        const headSm = { ...S.head, font: { bold: true, sz: 8, color: { rgb: 'FFFFFF' } } };
        CR.set(0, 0, txt(`Cronograma — ${orc.nome}`, { ...S.head, alignment: { horizontal: 'left', vertical: 'center' } }));
        for (let c = 1; c < FIX; c++) CR.set(0, c, txt('', S.head));
        CR.merge(0, 0, FIX - 1);
        let inicioGrupo = 0;
        periodos.forEach((p, i) => {
          CR.set(0, FIX + i, txt(p.grupo, headSm));
          const fimDoGrupo = i === periodos.length - 1 || periodos[i + 1].grupo !== p.grupo;
          if (fimDoGrupo) { CR.merge(0, FIX + inicioGrupo, FIX + i); inicioGrupo = i + 1; }
        });
        ['Atividade', 'Perfil', 'Início', 'Fim', 'Custo'].forEach((h, c) => CR.set(1, c, txt(h, S.head)));
        periodos.forEach((p, i) => CR.set(1, FIX + i, txt(p.label, headSm)));

        const grade = { top: thin, bottom: thin, left: { style: 'hair', color: { rgb: 'E2E8F0' } }, right: { style: 'hair', color: { rgb: 'E2E8F0' } } };
        const barra = (ini: string, fim: string, cor: string, rr: number) => {
          periodos.forEach((p, i) => {
            const ativo = ini <= p.fim && fim >= p.ini;
            CR.set(rr, FIX + i, txt('', ativo ? { fill: { fgColor: { rgb: rgb(cor) } }, border: grade } : { border: grade }));
          });
        };
        const linhaResumo = (rr: number, nome: string, ini: string, fim: string, custo: number, corBarra: string, corFundo: string, corTexto = '0F3460') => {
          const st = { font: { bold: true, color: { rgb: corTexto } }, fill: { fgColor: { rgb: rgb(corFundo) } }, border };
          CR.set(rr, 0, txt(nome, st));
          CR.set(rr, 1, txt('', st));
          CR.set(rr, 2, data(ini, { ...st, alignment: { horizontal: 'center' } }));
          CR.set(rr, 3, data(fim, { ...st, alignment: { horizontal: 'center' } }));
          CR.set(rr, 4, num(custo, Z_BRL, { ...st, alignment: { horizontal: 'right' } }));
          barra(ini, fim, corBarra, rr);
        };

        let rr = 2;
        linhaResumo(rr++, comFrentes ? 'Geral (todas as frentes)' : 'Geral', range.minDate, range.maxDate, totalPessoas, '#0F3460', '#DBEAFE');
        for (const g of grupos) {
          const datadas = g.atividades.filter(a => a.dataInicio && a.dataFim);
          if (!datadas.length) continue;
          if (comFrentes) linhaResumo(rr++, g.nome, g.inicio, g.fim, g.custo, g.cor, this.clarear(g.cor, 0.82));
          for (const a of datadas) {
            CR.set(rr, 0, txt(a.nome, { border, alignment: { indent: comFrentes ? 1 : 0 } }));
            CR.set(rr, 1, txt(this.perfilNome(a.perfilId)));
            CR.set(rr, 2, data(a.dataInicio));
            CR.set(rr, 3, data(a.dataFim));
            CR.set(rr, 4, num(this.atividadeCusto(a), Z_BRL));
            barra(a.dataInicio, a.dataFim, a.cor || '#4f87f0', rr);
            rr++;
          }
        }
        wsCrono = CR.fechar([
          { wch: 34 }, { wch: 22 }, { wch: 11 }, { wch: 11 }, { wch: 14 },
          ...periodos.map(() => ({ wch: semanal ? 5.5 : 8 })),
        ]);
      }

      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
      XLSX.utils.book_append_sheet(wb, wsAt, 'Atividades');
      if (wsCrono) XLSX.utils.book_append_sheet(wb, wsCrono, 'Cronograma');
      if (wsCloud) XLSX.utils.book_append_sheet(wb, wsCloud, 'Cloud');
      XLSX.writeFile(wb, this.nomeArquivo(orc, 'xlsx'));
    } finally {
      this.exportandoPlanilha = false;
    }
  }

  // ── private ───────────────────────────────────────────────────────────────

  private emptyBudgetForm() { return { nome: '', descricao: '', dataBase: this.hoje() }; }
  private emptyAtividadeForm() { return { nome: '', frente: '', perfilId: '', horas: 0, dataInicio: '', dataFim: '', alocacaoPct: 100 }; }
  private emptyTemplateForm(): { nome: string; descricao: string; atividades: any[] } {
    return { nome: '', descricao: '', atividades: [] };
  }
  private emptyTemplateAtvForm() {
    return { nome: '', frente: '', perfilId: '', horas: 8, offsetDias: 0, duracaoDias: 1, alocacaoPct: 100 };
  }
  private emptyCloudForm() {
    return { nome: '', servico: '', valorMensal: 0, mesesContratados: 12 };
  }
}
