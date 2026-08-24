import { ChangeDetectorRef, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';

interface AbsRow {
  id: string;
  pessoaId: string;
  pessoaNome: string;
  tipo: string;
  inicio: string;   // yyyy-MM-dd
  fim: string;      // yyyy-MM-dd
  recorrente: boolean;
  observacao: string;
  conflitosOk?: string[];
  criadoEm?: string;
}

/**
 * Uma ausência posicionada no calendário com as datas já resolvidas.
 *
 * Ausências recorrentes guardam apenas dia/mês, então geram uma ocorrência por
 * ano tocado pela janela exibida — por isso a mesma AbsRow pode aparecer duas
 * vezes quando a janela cruza a virada do ano.
 */
interface Ocorrencia {
  ab: AbsRow;
  inicio: Date;
  fim: Date;
  inicioIso: string;
  fimIso: string;
}

interface Coluna {
  ano: number;
  mes: number;
  label: string;
  /** Marca a coluna onde o ano muda, para o cabeçalho mostrar o ano. */
  mostraAno: boolean;
}

interface Conflito {
  id: string;
  pessoa1Id: string;
  pessoa1Nome: string;
  pessoa2Id: string;
  pessoa2Nome: string;
  a1: AbsRow;
  a2: AbsRow;
  o1: Ocorrencia;
  o2: Ocorrencia;
  overlapInicio: string;
  overlapFim: string;
  overlapDias: number;
}

import { ScrollIntoViewWhenDirective } from "../../core/scroll-into-view-when.directive";

@Component({
  selector: 'app-ausencias-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollIntoViewWhenDirective, SearchableSelectDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './ausencias-panel.component.html',
  styleUrl: './ausencias-panel.component.scss'
})
export class AusenciasPanelComponent implements OnChanges {
  private cdr = inject(ChangeDetectorRef);
  @Input() pessoas: any[] = [];
  @Input() ausencias: AbsRow[] = [];
  @Input() linhasOrcamentarias: any[] = [];
  @Input() alocacoes: any[] = [];
  @Output() create = new EventEmitter<Omit<AbsRow, 'id' | 'criadoEm'>>();
  @Output() update = new EventEmitter<AbsRow>();
  @Output() remove = new EventEmitter<string>();
  /** Redefine os grupos de uma pessoa sem sair da tela de férias. */
  @Output() updateGrupos = new EventEmitter<{ pessoaId: string; grupos: string[] }>();

  @ViewChild('absCalendario') absCalendario?: ElementRef<HTMLElement>;

  private readonly hoje = new Date();
  ano = new Date().getFullYear();
  mesHover = -1;

  /**
   * 'recente' abre em 12 meses a partir do mês anterior ao atual — férias já
   * encerradas saem da frente. 'ano' volta ao calendário Jan–Dez navegável.
   */
  modoPeriodo: 'recente' | 'ano' = 'recente';

  // ── janela exibida ────────────────────────────────────────────────────────

  /** Primeiro dia do mês anterior ao atual: início da visão padrão. */
  private inicioJanelaRecente(): Date {
    return new Date(this.hoje.getFullYear(), this.hoje.getMonth() - 1, 1);
  }

  /** As 12 colunas de mês da visão atual. */
  colunas(): Coluna[] {
    const out: Coluna[] = [];
    if (this.modoPeriodo === 'ano') {
      for (let m = 0; m < 12; m++) {
        out.push({ ano: this.ano, mes: m, label: this.MESES[m], mostraAno: false });
      }
      return out;
    }
    const inicio = this.inicioJanelaRecente();
    for (let i = 0; i < 12; i++) {
      const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
      out.push({
        ano: d.getFullYear(),
        mes: d.getMonth(),
        label: this.MESES[d.getMonth()],
        // Ano no cabeçalho da primeira coluna e sempre que ele vira.
        mostraAno: i === 0 || d.getMonth() === 0,
      });
    }
    return out;
  }

  private janelaInicio(): Date {
    const c = this.colunas()[0];
    return new Date(c.ano, c.mes, 1);
  }

  private janelaFim(): Date {
    const cols = this.colunas();
    const c = cols[cols.length - 1];
    return new Date(c.ano, c.mes + 1, 0);
  }

  /** Rótulo do período exibido, usado no título, na exportação e no arquivo. */
  labelPeriodo(): string {
    if (this.modoPeriodo === 'ano') return String(this.ano);
    const cols = this.colunas();
    const a = cols[0];
    const b = cols[cols.length - 1];
    return `${this.MESES[a.mes]}/${a.ano} – ${this.MESES[b.mes]}/${b.ano}`;
  }

  /**
   * Posição (em %) da linha do dia atual dentro da coluna, ou null quando a
   * coluna não é o mês corrente (nenhuma linha é desenhada).
   */
  marcadorHoje(col: Coluna): number | null {
    if (col.ano !== this.hoje.getFullYear() || col.mes !== this.hoje.getMonth()) return null;
    const diasNoMes = new Date(col.ano, col.mes + 1, 0).getDate();
    // Centraliza a linha no dia de hoje.
    return ((this.hoje.getDate() - 0.5) / diasNoMes) * 100;
  }

  // ── formulário ────────────────────────────────────────────────────────────

  formOpen = false;
  editingId = '';
  form = this.emptyForm();

  private emptyForm() {
    return {
      pessoaId: '',
      pessoaNome: '',
      tipo: 'FERIAS',
      inicio: '',
      fim: '',
      recorrente: false,
      observacao: ''
    };
  }

  ngOnChanges(c: SimpleChanges) {
    if (c['pessoas'] && !this.form.pessoaId && this.pessoas.length)
      this.form.pessoaId = '';
    // O último integrante pode ter saído do grupo filtrado; sem isso o filtro
    // continuaria ativo apontando para um grupo que não existe mais.
    if (c['pessoas'] && this.filterGrupo && this.filterGrupo !== this.SEM_GRUPO
        && !this.gruposDisponiveis().includes(this.filterGrupo))
      this.filterGrupo = '';
  }

  readonly MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  readonly TIPOS: Record<string, string> = {
    FERIAS: 'Férias', AUSENCIA: 'Ausência', LICENCA: 'Licença', OUTRO: 'Outro'
  };
  readonly CORES: Record<string, string> = {
    FERIAS: '#22c55e', AUSENCIA: '#f59e0b', LICENCA: '#6366f1', OUTRO: '#94a3b8'
  };

  todasAsPessoas(): any[] {
    return this.pessoas;
  }

  // ── ocorrências na janela ─────────────────────────────────────────────────

  private iso(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dia}`;
  }

  private cacheOcorrenciasChave = '';
  private cacheOcorrenciasAus: AbsRow[] | null = null;
  private cacheOcorrenciasPessoas: any[] | null = null;
  private cacheOcorrenciasValor: Ocorrencia[] = [];

  /**
   * Ausências que tocam a janela exibida, já restritas ao grupo filtrado e com
   * as datas resolvidas.
   *
   * O escopo do grupo é aplicado aqui de propósito: assim as barras, os totais
   * por tipo e — principalmente — os conflitos passam a enxergar apenas as
   * pessoas do grupo selecionado.
   */
  ocorrencias(): Ocorrencia[] {
    const chave = `${this.modoPeriodo}|${this.ano}|${this.filterGrupo}`;
    if (this.cacheOcorrenciasAus === this.ausencias
        && this.cacheOcorrenciasPessoas === this.pessoas
        && this.cacheOcorrenciasChave === chave) {
      return this.cacheOcorrenciasValor;
    }

    const escopo = this.pessoaIdsNoGrupo();
    const jIni = this.janelaInicio();
    const jFim = this.janelaFim();
    // Uma janela de 12 meses toca no máximo dois anos.
    const anos = [...new Set([jIni.getFullYear(), jFim.getFullYear()])];

    const out: Ocorrencia[] = [];
    for (const ab of this.ausencias) {
      if (escopo && !escopo.has(ab.pessoaId)) continue;
      if (!ab.inicio || !ab.fim) continue;
      const datas: Array<[Date, Date]> = ab.recorrente
        ? anos.map(a => [
            new Date(`${a}-${ab.inicio.slice(5)}T00:00:00`),
            new Date(`${a}-${ab.fim.slice(5)}T00:00:00`),
          ] as [Date, Date])
        : [[new Date(ab.inicio + 'T00:00:00'), new Date(ab.fim + 'T00:00:00')]];
      for (const [inicio, fim] of datas) {
        if (fim < jIni || inicio > jFim) continue;
        out.push({ ab, inicio, fim, inicioIso: this.iso(inicio), fimIso: this.iso(fim) });
      }
    }

    this.cacheOcorrenciasAus = this.ausencias;
    this.cacheOcorrenciasPessoas = this.pessoas;
    this.cacheOcorrenciasChave = chave;
    this.cacheOcorrenciasValor = out;
    return out;
  }

  barsForPersonMonth(pessoaId: string, col: Coluna): Array<{ oc: Ocorrencia; left: number; width: number; color: string; label: string }> {
    const daysInMonth = new Date(col.ano, col.mes + 1, 0).getDate();
    const monthStart  = new Date(col.ano, col.mes, 1);
    const monthEnd    = new Date(col.ano, col.mes, daysInMonth);

    return this.ocorrencias()
      .filter(o => o.ab.pessoaId === pessoaId)
      .flatMap(o => {
        const clampS = o.inicio < monthStart ? monthStart : o.inicio;
        const clampE = o.fim    > monthEnd   ? monthEnd   : o.fim;
        if (clampS > clampE) return [];

        const left  = ((clampS.getDate() - 1) / daysInMonth) * 100;
        const right = ((clampE.getDate())     / daysInMonth) * 100;

        return [{
          oc: o,
          left,
          width: right - left,
          color: this.CORES[o.ab.tipo] ?? '#94a3b8',
          label: this.TIPOS[o.ab.tipo] ?? o.ab.tipo,
        }];
      });
  }

  labelTipoAbrev(tipo: string): string {
    const map: Record<string, string> = { FERIAS: 'FÉR', AUSENCIA: 'AUS', LICENCA: 'LIC', OUTRO: 'OUT' };
    return map[tipo] ?? tipo.slice(0, 3).toUpperCase();
  }

  // ── filtros ───────────────────────────────────────────────────────────────

  searchPessoa = '';
  filterTipo = '';
  filterLoId = '';
  /** '' = todos os grupos; SEM_GRUPO = apenas pessoas sem grupo definido. */
  filterGrupo = '';
  readonly SEM_GRUPO = '__sem_grupo__';

  private normNome(v: string): string {
    return String(v || '').trim().toLowerCase();
  }

  // ── grupos ────────────────────────────────────────────────────────────────

  /** Grupos da pessoa, já limpos. Uma pessoa pode pertencer a vários. */
  gruposDaPessoa(pessoaId: string): string[] {
    const grupos = this.pessoas.find(p => p.id === pessoaId)?.grupos;
    if (!Array.isArray(grupos)) return [];
    return grupos.map((g: any) => String(g || '').trim()).filter(Boolean);
  }

  /** Grupos cadastrados nas pessoas, sem repetição e em ordem alfabética. */
  gruposDisponiveis(): string[] {
    const set = new Set<string>();
    for (const p of this.pessoas) {
      for (const g of this.gruposDaPessoa(p.id)) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  private mesmoGrupo(a: string, b: string): boolean {
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0;
  }

  private pessoaNoGrupoFiltrado(p: any): boolean {
    if (!this.filterGrupo) return true;
    const grupos = this.gruposDaPessoa(p.id);
    if (this.filterGrupo === this.SEM_GRUPO) return grupos.length === 0;
    return grupos.some(g => this.mesmoGrupo(g, this.filterGrupo));
  }

  /** Ids das pessoas do grupo filtrado, ou null quando nenhum grupo está selecionado. */
  private pessoaIdsNoGrupo(): Set<string> | null {
    if (!this.filterGrupo) return null;
    return new Set(this.pessoas.filter(p => this.pessoaNoGrupoFiltrado(p)).map(p => p.id));
  }

  /** Rótulo do grupo em uso, para cabeçalho de exportação e nome de arquivo. */
  labelGrupoFiltrado(): string {
    if (!this.filterGrupo) return 'Todos os grupos';
    return this.filterGrupo === this.SEM_GRUPO ? 'Sem grupo' : this.filterGrupo;
  }

  // ── edição dos grupos direto na tabela ────────────────────────────────────

  grupoEditandoId = '';
  /** Rascunho dos grupos da pessoa em edição; só vai ao backend ao confirmar. */
  grupoEditLista: string[] = [];
  grupoEditValor = '';

  abrirEdicaoGrupos(pessoaId: string) {
    this.grupoEditandoId = pessoaId;
    this.grupoEditLista = [...this.gruposDaPessoa(pessoaId)];
    this.grupoEditValor = '';
    // Só existe um editor aberto por vez; foca assim que o Angular o renderiza.
    setTimeout(() => document.querySelector<HTMLInputElement>('.abs-grupo-input')?.focus(), 0);
  }

  cancelarEdicaoGrupos() {
    this.grupoEditandoId = '';
    this.grupoEditLista = [];
    this.grupoEditValor = '';
  }

  adicionarGrupoEdicao() {
    const grupo = this.grupoEditValor.trim();
    if (!grupo) return;
    if (!this.grupoEditLista.some(g => this.mesmoGrupo(g, grupo))) this.grupoEditLista = [...this.grupoEditLista, grupo];
    this.grupoEditValor = '';
  }

  removerGrupoEdicao(grupo: string) {
    this.grupoEditLista = this.grupoEditLista.filter(g => g !== grupo);
  }

  /** Grupos existentes que a pessoa em edição ainda não tem — alimenta o autocomplete. */
  gruposSugeridosEdicao(): string[] {
    return this.gruposDisponiveis().filter(g => !this.grupoEditLista.some(x => this.mesmoGrupo(x, g)));
  }

  salvarGrupos() {
    if (!this.grupoEditandoId) return;
    const pessoaId = this.grupoEditandoId;
    // O que estiver digitado e ainda não confirmado também entra.
    this.adicionarGrupoEdicao();
    const grupos = [...this.grupoEditLista];
    const atuais = this.gruposDaPessoa(pessoaId);
    // Evita uma chamada ao backend quando nada mudou.
    const mudou = grupos.length !== atuais.length || grupos.some((g, i) => g !== atuais[i]);
    if (mudou) this.updateGrupos.emit({ pessoaId, grupos });
    this.cancelarEdicaoGrupos();
  }

  // ── LOs ───────────────────────────────────────────────────────────────────

  /** LOs disponíveis para filtro, ordenadas por ano (desc) e código. */
  losDisponiveis(): any[] {
    return [...(this.linhasOrcamentarias || [])].sort((a, b) => {
      const ano = Number(b?.ano || 0) - Number(a?.ano || 0);
      return ano !== 0 ? ano : this.normNome(a?.codigo || a?.nome).localeCompare(this.normNome(b?.codigo || b?.nome), 'pt-BR');
    });
  }

  loLabel(lo: any): string {
    return lo?.codigo || lo?.nome || lo?.id || '';
  }

  /** Nomes (normalizados) das pessoas alocadas na LO selecionada. */
  private nomesAlocadosNaLo(loId: string): Set<string> {
    const set = new Set<string>();
    for (const a of (this.alocacoes || [])) {
      if (a?.linhaOrcamentariaId === loId) set.add(this.normNome(a?.nomePessoa));
    }
    return set;
  }

  pessoasFiltradas(): any[] {
    const q = this.searchPessoa.trim().toLowerCase();
    const nomesLo = this.filterLoId ? this.nomesAlocadosNaLo(this.filterLoId) : null;
    return this.pessoas.filter(p => {
      if (q && !p.nome.toLowerCase().includes(q)) return false;
      if (!this.pessoaNoGrupoFiltrado(p)) return false;
      if (nomesLo && !nomesLo.has(this.normNome(p.nome))) return false;
      if (this.filterTipo) {
        return this.ocorrencias().some(o => o.ab.pessoaId === p.id && o.ab.tipo === this.filterTipo);
      }
      return true;
    });
  }

  totalPorTipo(tipo: string): number {
    return this.ocorrencias().filter(o => o.ab.tipo === tipo).length;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  openCreate(pessoaId = '') {
    this.editingId = '';
    this.form = { ...this.emptyForm(), pessoaId };
    if (pessoaId) {
      const p = this.pessoas.find(x => x.id === pessoaId);
      if (p) this.form.pessoaNome = p.nome;
    }
    this.formOpen = true;
  }

  /**
   * Abre o formulário para a ocorrência clicada. Recorrentes guardam só dia/mês,
   * então o campo mostra a data já resolvida no ano daquela ocorrência.
   */
  startEditOcorrencia(o: Ocorrencia) {
    const a = o.ab;
    this.editingId = a.id;
    this.form = {
      pessoaId: a.pessoaId,
      pessoaNome: a.pessoaNome,
      tipo: a.tipo,
      inicio: o.inicioIso,
      fim: o.fimIso,
      recorrente: a.recorrente,
      observacao: a.observacao
    };
    this.formOpen = true;
  }

  onPessoaChange() {
    const p = this.pessoas.find(x => x.id === this.form.pessoaId);
    this.form.pessoaNome = p ? p.nome : '';
  }

  submit() {
    if (!this.form.pessoaId || !this.form.inicio || !this.form.fim) return;
    const payload = { ...this.form };
    if (this.editingId) {
      const current = this.ausencias.find(a => a.id === this.editingId);
      this.update.emit({ id: this.editingId, criadoEm: undefined, conflitosOk: current?.conflitosOk ?? [], ...payload });
    } else {
      this.create.emit(payload);
    }
    this.cancelForm();
  }

  cancelForm() {
    this.formOpen = false;
    this.editingId = '';
    this.form = this.emptyForm();
  }

  // ── totais ────────────────────────────────────────────────────────────────

  /** Duração da ocorrência em dias corridos. */
  diasDaOcorrencia(o: Ocorrencia): number {
    const dias = Math.round((o.fim.getTime() - o.inicio.getTime()) / 86_400_000) + 1;
    return dias > 0 ? dias : 0;
  }

  diasAusentePorPessoa(pessoaId: string): number {
    return this.ocorrencias()
      .filter(o => o.ab.pessoaId === pessoaId)
      .reduce((total, o) => total + this.diasDaOcorrencia(o), 0);
  }

  fmtDate(d: string): string {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  /** Ocorrências da pessoa na janela, em ordem cronológica (linhas de detalhe). */
  ausenciasDaPessoa(pessoaId: string): Ocorrencia[] {
    return this.ocorrencias()
      .filter(o => o.ab.pessoaId === pessoaId)
      .sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));
  }

  // ── detecção de conflitos ─────────────────────────────────────────────────

  private cacheConflitosChave = '';
  private cacheConflitosFonte: Ocorrencia[] | null = null;
  private cacheConflitosValor: Conflito[] = [];

  /**
   * Sobreposições entre pessoas diferentes dentro da janela exibida. Quando há
   * grupo filtrado, só entram pessoas daquele grupo (ver `ocorrencias`).
   */
  conflitos(): Conflito[] {
    const ocs = this.ocorrencias();
    const chave = `${this.modoPeriodo}|${this.ano}|${this.filterGrupo}`;
    if (this.cacheConflitosFonte === ocs && this.cacheConflitosChave === chave) return this.cacheConflitosValor;

    const result: Conflito[] = [];
    for (let i = 0; i < ocs.length; i++) {
      for (let j = i + 1; j < ocs.length; j++) {
        const o1 = ocs[i];
        const o2 = ocs[j];
        if (o1.ab.pessoaId === o2.ab.pessoaId) continue;
        const oS = o1.inicio > o2.inicio ? o1.inicio : o2.inicio;
        const oE = o1.fim    < o2.fim    ? o1.fim    : o2.fim;
        if (oS > oE) continue;
        const dias = Math.round((oE.getTime() - oS.getTime()) / 86_400_000) + 1;
        const overlapInicio = this.iso(oS);
        result.push({
          // A mesma dupla de ausências pode colidir em dois anos quando ambas
          // são recorrentes: a data da sobreposição desempata a chave.
          id: `${o1.ab.id}|${o2.ab.id}|${overlapInicio}`,
          pessoa1Id:   o1.ab.pessoaId,
          pessoa1Nome: o1.ab.pessoaNome || this.pessoas.find(p => p.id === o1.ab.pessoaId)?.nome || o1.ab.pessoaId,
          pessoa2Id:   o2.ab.pessoaId,
          pessoa2Nome: o2.ab.pessoaNome || this.pessoas.find(p => p.id === o2.ab.pessoaId)?.nome || o2.ab.pessoaId,
          a1: o1.ab, a2: o2.ab,
          o1, o2,
          overlapInicio,
          overlapFim: this.iso(oE),
          overlapDias: dias,
        });
      }
    }

    this.cacheConflitosFonte = ocs;
    this.cacheConflitosChave = chave;
    this.cacheConflitosValor = result;
    return result;
  }

  conflitosPendentes(): Conflito[] {
    return this.conflitos().filter(c => !this.conflitoOk(c));
  }

  conflitosOk(): Conflito[] {
    return this.conflitos().filter(c => this.conflitoOk(c));
  }

  conflitosVisiveis(): Conflito[] {
    return this.ocultarConflitosOk ? this.conflitosPendentes() : this.conflitos();
  }

  conflitoOk(c: Conflito): boolean {
    return (c.a1.conflitosOk || []).includes(c.a2.id) || (c.a2.conflitosOk || []).includes(c.a1.id);
  }

  marcarConflitoOk(c: Conflito) {
    this.update.emit({
      ...c.a1,
      conflitosOk: [...new Set([...(c.a1.conflitosOk || []), c.a2.id])]
    });
  }

  temConflito(pessoaId: string): boolean {
    return this.conflitosPendentes().some(c => c.pessoa1Id === pessoaId || c.pessoa2Id === pessoaId);
  }

  conflitosParaPessoa(pessoaId: string): Conflito[] {
    return this.conflitosPendentes().filter(c => c.pessoa1Id === pessoaId || c.pessoa2Id === pessoaId);
  }

  isConflitante(ausenciaId: string): boolean {
    return this.conflitosPendentes().some(c => c.a1.id === ausenciaId || c.a2.id === ausenciaId);
  }

  conflitosOpen = true;
  ocultarConflitosOk = true;

  // ── linhas expandidas ─────────────────────────────────────────────────────

  expandedRows = new Set<string>();
  toggleRow(pessoaId: string) {
    if (this.expandedRows.has(pessoaId)) this.expandedRows.delete(pessoaId);
    else this.expandedRows.add(pessoaId);
  }
  isExpanded(pessoaId: string) { return this.expandedRows.has(pessoaId); }

  // ── exportação da visão ───────────────────────────────────────────────────

  exportOpen = false;
  exportandoImagem = false;

  private nomeDaPessoa(pessoaId: string, fallback = ''): string {
    return this.pessoas.find(p => p.id === pessoaId)?.nome || fallback || pessoaId;
  }

  /** Ocorrências das pessoas visíveis, já respeitando grupo, busca, LO e tipo. */
  ocorrenciasVisiveis(): Ocorrencia[] {
    const ids = new Set(this.pessoasFiltradas().map(p => p.id));
    return this.ocorrencias()
      .filter(o => ids.has(o.ab.pessoaId))
      .filter(o => !this.filterTipo || o.ab.tipo === this.filterTipo)
      .sort((a, b) => {
        const nome = this.nomeDaPessoa(a.ab.pessoaId, a.ab.pessoaNome)
          .localeCompare(this.nomeDaPessoa(b.ab.pessoaId, b.ab.pessoaNome), 'pt-BR', { sensitivity: 'base' });
        return nome !== 0 ? nome : a.inicioIso.localeCompare(b.inicioIso);
      });
  }

  private filtrosAtivosDescricao(): string {
    const partes = [`Período: ${this.labelPeriodo()}`, `Grupo: ${this.labelGrupoFiltrado()}`];
    if (this.filterTipo) partes.push(`Tipo: ${this.TIPOS[this.filterTipo] ?? this.filterTipo}`);
    if (this.filterLoId) {
      const lo = (this.linhasOrcamentarias || []).find(x => x?.id === this.filterLoId);
      partes.push(`LO: ${lo ? this.loLabel(lo) : this.filterLoId}`);
    }
    if (this.searchPessoa.trim()) partes.push(`Busca: ${this.searchPessoa.trim()}`);
    return partes.join(' | ');
  }

  private slugArquivo(v: string): string {
    return String(v || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  /** Nome-base dos arquivos exportados, com período e grupo em uso. */
  private nomeArquivo(): string {
    const periodo = this.slugArquivo(this.labelPeriodo());
    const grupo = this.filterGrupo ? `_${this.slugArquivo(this.labelGrupoFiltrado())}` : '';
    return `ferias_ausencias_${periodo}${grupo}`;
  }

  /** Exporta a visão atual (pessoas, ausências e conflitos) em CSV. */
  exportarCsv() {
    const rows: (string | number)[][] = [];
    rows.push([`Férias & Ausências — ${this.labelPeriodo()}`]);
    rows.push([this.filtrosAtivosDescricao()]);
    rows.push([]);

    rows.push(['Pessoa', 'Grupos', 'Tipo', 'Início', 'Fim', 'Dias', 'Recorrente', 'Observação']);
    for (const o of this.ocorrenciasVisiveis()) {
      rows.push([
        this.nomeDaPessoa(o.ab.pessoaId, o.ab.pessoaNome),
        this.gruposDaPessoa(o.ab.pessoaId).join('; ') || 'Sem grupo',
        this.TIPOS[o.ab.tipo] ?? o.ab.tipo,
        this.fmtDate(o.inicioIso),
        this.fmtDate(o.fimIso),
        this.diasDaOcorrencia(o),
        o.ab.recorrente ? 'Sim' : 'Não',
        o.ab.observacao || ''
      ]);
    }

    rows.push([]);
    rows.push(['Total de dias por pessoa']);
    rows.push(['Pessoa', 'Grupos', 'Dias']);
    for (const p of this.pessoasFiltradas()) {
      rows.push([p.nome, this.gruposDaPessoa(p.id).join('; ') || 'Sem grupo', this.diasAusentePorPessoa(p.id)]);
    }

    // Conflitos já vêm restritos ao período e ao grupo filtrado (ver ocorrencias).
    rows.push([]);
    rows.push([`Conflitos de período (${this.labelGrupoFiltrado()})`]);
    rows.push(['Status', 'Pessoa 1', 'Grupos 1', 'Período 1', 'Pessoa 2', 'Grupos 2', 'Período 2', 'Sobreposição', 'Dias sobrepostos']);
    for (const c of this.conflitos()) {
      rows.push([
        this.conflitoOk(c) ? 'OK' : 'Pendente',
        c.pessoa1Nome,
        this.gruposDaPessoa(c.pessoa1Id).join('; ') || 'Sem grupo',
        `${this.fmtDate(c.o1.inicioIso)} → ${this.fmtDate(c.o1.fimIso)}`,
        c.pessoa2Nome,
        this.gruposDaPessoa(c.pessoa2Id).join('; ') || 'Sem grupo',
        `${this.fmtDate(c.o2.inicioIso)} → ${this.fmtDate(c.o2.fimIso)}`,
        `${this.fmtDate(c.overlapInicio)} → ${this.fmtDate(c.overlapFim)}`,
        c.overlapDias
      ]);
    }

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.nomeArquivo()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Exporta o calendário como PNG. Renderiza um clone fora da tela para capturar
   * a tabela inteira mesmo com a rolagem horizontal, com título e filtros no topo.
   */
  async exportarPng(): Promise<void> {
    const tabela = this.absCalendario?.nativeElement;
    if (!tabela || this.exportandoImagem) return;

    this.exportandoImagem = true;
    this.cdr.detectChanges();

    const palco = document.createElement('div');
    try {
      const { default: html2canvas } = await import('html2canvas');

      const largura = tabela.scrollWidth;
      Object.assign(palco.style, {
        position: 'fixed',
        top: '-99999px',
        left: '-99999px',
        zIndex: '-1',
        pointerEvents: 'none',
        background: '#ffffff',
        padding: '20px',
        width: `${largura + 40}px`,
        font: '400 13px system-ui, -apple-system, Segoe UI, sans-serif',
      });

      const titulo = document.createElement('div');
      titulo.textContent = `Férias & Ausências — ${this.labelPeriodo()}`;
      Object.assign(titulo.style, { font: '700 18px system-ui, sans-serif', color: '#1e2d4e', marginBottom: '4px' });

      const subtitulo = document.createElement('div');
      subtitulo.textContent = this.filtrosAtivosDescricao();
      Object.assign(subtitulo.style, { font: '400 12px system-ui, sans-serif', color: '#64748b', marginBottom: '12px' });

      const clone = tabela.cloneNode(true) as HTMLElement;
      Object.assign(clone.style, { width: `${largura}px`, minWidth: `${largura}px` });
      // Botões e chips de ação não fazem sentido numa imagem estática.
      clone.querySelectorAll('.abs-col-actions, .abs-cell-actions, .abs-detail-actions, .abs-expand-btn, .abs-grupo-chip-vazio')
        .forEach(el => el.remove());

      palco.append(titulo, subtitulo, clone);
      document.body.appendChild(palco);

      const canvas = await html2canvas(palco, {
        scale: Math.max(2, window.devicePixelRatio || 1),
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: palco.scrollWidth,
        height: palco.scrollHeight,
      });

      const a = document.createElement('a');
      a.download = `${this.nomeArquivo()}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } finally {
      if (palco.parentNode) document.body.removeChild(palco);
      this.exportandoImagem = false;
      this.cdr.detectChanges();
    }
  }
}
