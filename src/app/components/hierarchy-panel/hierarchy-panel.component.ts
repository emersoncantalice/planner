import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';
import { ScrollIntoViewWhenDirective } from '../../core/scroll-into-view-when.directive';

interface HierarchyMember { personId: string | null; nomePessoa: string; papel: string; cross?: boolean; vinculo?: string | null; percentual?: number | null; subgrupo?: string | null; }
interface HierarchyNode {
  id: string; tipo: string; nome: string; descricao?: string;
  parentId?: string | null; ordem?: number; membros?: HierarchyMember[]; loIds?: string[];
}

@Component({
  selector: 'app-hierarchy-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollIntoViewWhenDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './hierarchy-panel.component.html',
  styleUrl: './hierarchy-panel.component.scss'
})
export class HierarchyPanelComponent {
  private toast = inject(ToastService);
  readonly tbdNome = 'TBD - To be defined';
  @Input() nodes: HierarchyNode[] = [];
  @Input() pessoas: any[] = [];
  @Input() perfis: any[] = [];
  @Input() fotos: Record<string, string> = {};
  @Input() percentuais: Record<string, number> = {};
  @Input() linhasOrcamentarias: any[] = [];
  @Input() ajustes: any[] = [];
  @Input() alocacoes: any[] = [];
  @Output() create = new EventEmitter<any>();
  @Output() update = new EventEmitter<any>();
  @Output() remove = new EventEmitter<string>();
  @Output() moveMember = new EventEmitter<{ fromNodeId: string; toNodeId: string; nomePessoa: string }>();

  readonly tipos = ['PRESIDENCIA', 'DIRETORIA', 'TRIBO', 'SQUAD'];
  readonly tipoLabels: Record<string, string> = {
    PRESIDENCIA: 'Presidência',
    DIRETORIA: 'Diretoria',
    TRIBO: 'Tribo',
    SQUAD: 'Squad'
  };

  formAberto = false;
  editingId = '';
  form = { tipo: 'PRESIDENCIA', nome: '', descricao: '', parentId: '', loIds: [] as string[] };
  membros: HierarchyMember[] = [];
  membroSel = { personId: '', papel: '', cross: false, subgrupo: '' };

  // Definição dos grupos por vínculo (usada no template). Cross é badge, não grupo.
  readonly grupoDefs = [
    { key: 'folha', titulo: 'Folha', cls: 'g-folha' },
    { key: 'terceiro', titulo: 'Terceiros', cls: 'g-terceiro' }
  ];
  // Vínculo escolhido ao adicionar uma pessoa TBD (sem cadastro).
  tbdVinculo: 'FOLHA' | 'TERCEIRO' = 'FOLHA';

  // Geração de squad a partir de uma LO (importando pessoas)
  gerarAberto = false;
  gerarLoId = '';
  gerarParentId = '';
  exportRootId = '';
  ocultarValoresExport = false;

  // Drag de pessoas entre estruturas
  private dragOrigem: { nodeId: string; index: number } | null = null;
  dragOverNodeId = '';

  tipoLabel(tipo: string): string {
    return this.tipoLabels[tipo] || tipo;
  }

  // ── Árvore ────────────────────────────────────────────────────────────
  private byOrdem(a: HierarchyNode, b: HierarchyNode): number {
    const oa = a.ordem ?? 0, ob = b.ordem ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  }

  raizes(): HierarchyNode[] {
    const ids = new Set(this.nodes.map(n => n.id));
    return this.nodes.filter(n => !n.parentId || !ids.has(n.parentId)).sort((a, b) => this.byOrdem(a, b));
  }

  // Raízes exibidas na tela — respeita a estrutura selecionada (preview da exportação).
  raizesVisiveis(): HierarchyNode[] {
    if (this.exportRootId) {
      const sel = this.nodes.find(n => n.id === this.exportRootId);
      if (sel) return [sel];
    }
    return this.raizes();
  }

  filhosDe(id: string): HierarchyNode[] {
    return this.nodes.filter(n => n.parentId === id).sort((a, b) => this.byOrdem(a, b));
  }

  // Opções de "pai" válidas (não pode ser o próprio nó nem um descendente).
  paisDisponiveis(): HierarchyNode[] {
    if (!this.editingId) return [...this.nodes].sort((a, b) => this.byOrdem(a, b));
    const proibidos = this.subtree(this.editingId);
    return this.nodes.filter(n => !proibidos.has(n.id)).sort((a, b) => this.byOrdem(a, b));
  }

  private subtree(rootId: string): Set<string> {
    const result = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of this.nodes) {
        if (n.parentId && result.has(n.parentId) && !result.has(n.id)) { result.add(n.id); changed = true; }
      }
    }
    return result;
  }

  totalPessoas(): number {
    const set = new Set<string>();
    for (const n of this.nodes) for (const m of (n.membros || [])) {
      if (!this.membroContaNoTotal(m)) continue;
      set.add(this.norm(m.nomePessoa));
    }
    return set.size;
  }

  // Perfis que não debitam da LO não entram no somatório de pessoas.
  private pessoaDebitaLo(pessoa: any | null): boolean {
    const perfilId = String(pessoa?.perfilId || '').trim();
    if (perfilId) {
      const perfil = this.perfis.find((x: any) => String(x?.id || '').trim() === perfilId);
      if (perfil) return perfil.debitaLo !== false;
    }
    const nome = this.norm(this.perfilNomeDaPessoa(pessoa));
    if (nome) {
      const perfil = this.perfis.find((x: any) => this.norm(x?.nomePerfil || x?.nome || '') === nome);
      if (perfil) return perfil.debitaLo !== false;
    }
    return true;
  }

  membroContaNoTotal(m: HierarchyMember): boolean {
    const p = this.pessoaDoMembro(m);
    if (!p) return true; // TBD / sem cadastro: mantém no total
    return this.pessoaDebitaLo(p);
  }

  // ── Avatares ──────────────────────────────────────────────────────────
  private norm(nome: string): string { return String(nome || '').trim().toLowerCase(); }
  fotoDe(nome: string): string { return this.fotos?.[this.norm(nome)] || ''; }
  iniciais(nome: string): string {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    return ((partes[0][0] || '') + (partes.length > 1 ? (partes[partes.length - 1][0] || '') : '')).toUpperCase();
  }

  // ── Vínculo (Folha × Terceiro) e área da pessoa ─────────────────────────
  private pessoaDoMembro(m: HierarchyMember): any | null {
    if (m?.personId) {
      const porId = this.pessoas.find(p => p.id === m.personId);
      if (porId) return porId;
    }
    return this.pessoas.find(p => this.norm(p?.nome || '') === this.norm(m?.nomePessoa || '')) || null;
  }

  // Percentual de alocação da pessoa nas LOs (mesmo número da tela de Alocações). Mostrado em squad e tribo.
  mostrarPercentual(node: HierarchyNode): boolean {
    return node.tipo === 'SQUAD' || node.tipo === 'TRIBO';
  }

  percentualPessoa(m: HierarchyMember): number | null {
    // Override local da hierarquia tem prioridade (cópia para montar o time, não afeta a LO).
    if (m?.percentual != null) return Math.round(m.percentual);
    // Senão, copia do percentual de alocação na(s) LO(s).
    const v = this.percentuais?.[this.norm(m.nomePessoa)];
    return v == null ? null : Math.round(v);
  }

  // Cor do badge de percentual: escala de laranja (0%) a azul (100%).
  corPercentual(pct: number | null): string {
    const p = Math.max(0, Math.min(100, pct ?? 0)) / 100;
    const laranja = [249, 115, 22];
    const azul = [37, 99, 235];
    const c = laranja.map((v, i) => Math.round(v + (azul[i] - v) * p));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  // ── Edição inline do percentual na hierarquia (duplo clique) ────────────
  pctEditKey: string | null = null;
  pctEditValue: number | null = null;

  private pctKey(node: HierarchyNode, idx: number): string {
    return `${node.id}|${idx}`;
  }

  editandoPct(node: HierarchyNode, idx: number): boolean {
    return this.pctEditKey === this.pctKey(node, idx);
  }

  iniciarEdicaoPct(node: HierarchyNode, idx: number, m: HierarchyMember, ev: Event) {
    ev.stopPropagation();
    ev.preventDefault();
    this.pctEditKey = this.pctKey(node, idx);
    const atual = this.percentualPessoa(m);
    this.pctEditValue = atual == null ? 100 : atual;
  }

  salvarPct(node: HierarchyNode, idx: number) {
    if (this.pctEditKey !== this.pctKey(node, idx)) return;
    const raw = Number(this.pctEditValue);
    const valor = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : null;
    const membros = (node.membros || []).map((m, i) => i === idx ? { ...m, percentual: valor } : m);
    this.pctEditKey = null;
    this.pctEditValue = null;
    this.emitirAtualizacaoMembros(node, membros);
  }

  cancelarEdicaoPct() {
    this.pctEditKey = null;
    this.pctEditValue = null;
  }

  ehTerceiro(m: HierarchyMember): boolean {
    const p = this.pessoaDoMembro(m);
    if (p) return String(p.tipoVinculo || '').toUpperCase() === 'TERCEIRO';
    // TBD / sem cadastro: usa o vínculo classificado manualmente.
    return String(m?.vinculo || '').toUpperCase() === 'TERCEIRO';
  }

  vinculoLabel(m: HierarchyMember): string {
    return this.ehTerceiro(m) ? 'Terceiro' : 'Folha';
  }

  // Papel da pessoa na estrutura (cai para o perfil quando não há papel definido).
  papelDoMembro(m: HierarchyMember): string {
    if (m?.papel && m.papel.trim()) return this.primeiraPartePerfil(m.papel);
    const p = this.pessoaDoMembro(m);
    return this.primeiraPartePerfil(this.perfilNomeDaPessoa(p));
  }

  primeiraPartePerfil(value: string): string {
    return String(value || '').split('|')[0].trim();
  }

  private perfilNomeDaPessoa(pessoa: any | null): string {
    if (!pessoa) return '';
    const direto = String(pessoa?.perfilNome || pessoa?.perfil || '').trim();
    if (direto) return direto;
    const perfilId = String(pessoa?.perfilId || '').trim();
    if (!perfilId) return '';
    const perfil = this.perfis.find((x: any) => String(x?.id || '').trim() === perfilId);
    return String(perfil?.nomePerfil || perfil?.nome || '').trim();
  }

  // Área de origem: prestador (consultoria) para terceiros; perfil para folha.
  areaDoMembro(m: HierarchyMember): string {
    const p = this.pessoaDoMembro(m);
    if (!p) return '';
    const perfilNome = this.perfilNomeDaPessoa(p);
    if (this.ehTerceiro(m)) return p.consultoria || this.primeiraPartePerfil(perfilNome) || '';
    return this.primeiraPartePerfil(perfilNome);
  }

  // Linha de informação: papel · área (somente o que existir).
  metaDoMembro(m: HierarchyMember): string {
    const papel = this.papelDoMembro(m);
    const area = this.areaDoMembro(m);
    if (papel && area && this.norm(this.primeiraPartePerfil(papel)) === this.norm(this.primeiraPartePerfil(area))) return papel;
    return [papel, area].filter(Boolean).join(' · ');
  }

  // Membros do nó separados por vínculo, preservando o índice real em node.membros (p/ drag).
  ehCross(m: HierarchyMember): boolean {
    return !!m?.cross;
  }

  membrosPorGrupo(node: HierarchyNode, grupo: string, subgrupo: string | null = null): Array<{ m: HierarchyMember; idx: number }> {
    return (node.membros || [])
      .map((m, idx) => ({ m, idx }))
      .filter(x => {
        if (subgrupo != null && (x.m.subgrupo || '').trim() !== subgrupo) return false;
        // Cross é apenas um marcador (badge): a pessoa entra em Folha/Terceiro pelo vínculo.
        return this.ehTerceiro(x.m) === (grupo === 'terceiro');
      })
      // Ordena por disposição de papéis dentro da estrutura (tribo/squad), mantendo estabilidade.
      .sort((a, b) => (this.rankPapel(node, a.m) - this.rankPapel(node, b.m)) || (a.idx - b.idx));
  }

  // Subgrupos NOMEADOS definidos no nó (na ordem de aparição). Não cria bucket "Geral".
  subgruposDoNode(node: HierarchyNode): Array<{ key: string; label: string }> {
    const seen = new Set<string>();
    const out: Array<{ key: string; label: string }> = [];
    for (const m of (node.membros || [])) {
      const sg = (m.subgrupo || '').trim();
      if (!sg || seen.has(sg)) continue;
      seen.add(sg);
      out.push({ key: sg, label: sg });
    }
    return out;
  }

  // Lista para renderização: pessoas sem subgrupo ficam soltas (sem caixa/título);
  // cada subgrupo nomeado vira uma caixa com título.
  subgruposParaRender(node: HierarchyNode): Array<{ key: string; label: string; filter: string | null }> {
    const nomeados = this.subgruposDoNode(node);
    if (!nomeados.length) return [{ key: '__flat__', label: '', filter: null }];
    const out: Array<{ key: string; label: string; filter: string | null }> = [];
    if ((node.membros || []).some(m => !(m.subgrupo || '').trim())) {
      out.push({ key: '__flat__', label: '', filter: '' });
    }
    for (const s of nomeados) out.push({ key: s.key, label: s.label, filter: s.key });
    return out;
  }

  // Sugestões de subgrupos já usados em qualquer estrutura (para o datalist do formulário).
  subgruposSugeridos(): string[] {
    const set = new Set<string>();
    for (const n of this.nodes) for (const m of (n.membros || [])) {
      const sg = (m.subgrupo || '').trim();
      if (sg) set.add(sg);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  // Disposição (ordem) dos papéis dentro da estrutura.
  // Tribo: LPT → LTT/LNP → demais. Squad: IT Lead/PM → demais.
  private rankPapel(node: HierarchyNode, m: HierarchyMember): number {
    const t = this.norm(this.papelDoMembro(m));
    if (node.tipo === 'TRIBO') {
      if (t === 'lpt') return 0;
      if (t === 'ltt' || t === 'lnp') return 1;
      return 2;
    }
    if (node.tipo === 'SQUAD') {
      if (t === 'it lead' || t === 'pm') return 0;
      return 1;
    }
    return 0;
  }

  membrosPorVinculo(node: HierarchyNode, terceiro: boolean): Array<{ m: HierarchyMember; idx: number }> {
    return this.membrosPorGrupo(node, terceiro ? 'terceiro' : 'folha');
  }

  // Pessoa configurada para não contar no FTE (flag do cadastro de Pessoas).
  membroContaFte(m: HierarchyMember): boolean {
    const p = this.pessoaDoMembro(m);
    return !(p && p.contaFte === false);
  }

  // FTE: cada pessoa conta pelo seu percentual de alocação (sem % = 100%).
  // Pessoas marcadas para não contar ficam de fora.
  private fteMembro(m: HierarchyMember): number {
    if (!this.membroContaFte(m)) return 0;
    return (this.percentualPessoa(m) ?? 100) / 100;
  }

  fteGrupo(node: HierarchyNode, grupo: string, subgrupo: string | null = null): number {
    return this.membrosPorGrupo(node, grupo, subgrupo).reduce((s, x) => s + this.fteMembro(x.m), 0);
  }

  formatFte(value: number): string {
    const r = Math.round(value * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  percentualGrupoSquad(node: HierarchyNode, grupo: string, subgrupo: string | null = null): string {
    if (node.tipo !== 'SQUAD' || (grupo !== 'folha' && grupo !== 'terceiro')) return '';
    const folha = this.fteGrupo(node, 'folha', subgrupo);
    const terceiro = this.fteGrupo(node, 'terceiro', subgrupo);
    const total = folha + terceiro;
    if (!total) return '';
    const atual = grupo === 'folha' ? folha : terceiro;
    return `${Math.round((atual / total) * 100)}%`;
  }

  resumoGrupoSquad(node: HierarchyNode, grupo: string, subgrupo: string | null = null): string {
    const total = this.formatFte(this.fteGrupo(node, grupo, subgrupo));
    const percentual = this.percentualGrupoSquad(node, grupo, subgrupo);
    return percentual ? `${total} · ${percentual}` : total;
  }


  // ── Formulário ────────────────────────────────────────────────────────
  abrirNovo(parentId = '') {
    this.formAberto = true;
    this.editingId = '';
    this.form = { tipo: parentId ? this.tipoSugerido(parentId) : 'PRESIDENCIA', nome: '', descricao: '', parentId, loIds: [] };
    this.membros = [];
    this.membroSel = { personId: '', papel: '', cross: false, subgrupo: '' };
  }

  private tipoSugerido(parentId: string): string {
    const pai = this.nodes.find(n => n.id === parentId);
    const idx = pai ? this.tipos.indexOf(pai.tipo) : -1;
    return idx >= 0 && idx < this.tipos.length - 1 ? this.tipos[idx + 1] : 'SQUAD';
  }

  editar(node: HierarchyNode) {
    this.formAberto = true;
    this.editingId = node.id;
    this.form = {
      tipo: node.tipo,
      nome: node.nome,
      descricao: node.descricao || '',
      parentId: node.parentId || '',
      loIds: [...(node.loIds || [])]
    };
    this.membros = (node.membros || []).map(m => ({ personId: m.personId ?? null, nomePessoa: m.nomePessoa, papel: m.papel || '', cross: !!m.cross, vinculo: m.vinculo ?? null, percentual: m.percentual ?? null, subgrupo: m.subgrupo ?? null }));
    this.membroSel = { personId: '', papel: '', cross: false, subgrupo: '' };
  }

  cancelar() {
    this.formAberto = false;
    this.editingId = '';
    this.membros = [];
  }

  adicionarMembro() {
    if (!this.membroSel.personId) {
      this.toast.show('Selecione uma pessoa para adicionar à estrutura.', 'error');
      return;
    }
    const pessoa = this.pessoas.find(p => p.id === this.membroSel.personId);
    if (!pessoa) {
      this.toast.show('Pessoa selecionada não foi encontrada. Atualize a lista e tente novamente.', 'error');
      return;
    }
    if (this.membros.some(m => this.norm(m.nomePessoa) === this.norm(pessoa.nome))) {
      this.membroSel = { personId: '', papel: '', cross: false, subgrupo: this.membroSel.subgrupo };
      this.toast.show('Essa pessoa já está vinculada nesta estrutura.', 'error');
      return;
    }
    const sg = this.membroSel.subgrupo.trim();
    this.membros = [...this.membros, { personId: pessoa.id, nomePessoa: pessoa.nome, papel: this.membroSel.papel.trim(), cross: this.membroSel.cross, subgrupo: sg || null }];
    // mantém o subgrupo selecionado para facilitar adicionar vários na mesma "caixa"
    this.membroSel = { personId: '', papel: '', cross: false, subgrupo: this.membroSel.subgrupo };
  }

  adicionarMembroTbd() {
    const cargo = this.membroSel.papel.trim();
    if (!cargo) {
      this.toast.show('Informe o cargo da pessoa TBD antes de adicionar.', 'error');
      return;
    }
    if (this.norm(cargo) === 'to be defined' || this.norm(cargo) === this.norm(this.tbdNome)) {
      this.toast.show('O subtítulo do TBD deve ser o cargo da vaga, não "To be defined".', 'error');
      return;
    }
    const sg = this.membroSel.subgrupo.trim();
    this.membros = [...this.membros, { personId: null, nomePessoa: this.tbdNome, papel: cargo, cross: this.membroSel.cross, vinculo: this.tbdVinculo, subgrupo: sg || null }];
    this.membroSel = { personId: '', papel: '', cross: false, subgrupo: this.membroSel.subgrupo };
    this.tbdVinculo = 'FOLHA';
  }

  removerMembro(idx: number) {
    this.membros = this.membros.filter((_, i) => i !== idx);
  }

  podeSalvar(): boolean {
    return !!this.form.nome.trim() && this.tipos.includes(this.form.tipo);
  }

  private validarCadastro(): string {
    const nome = this.form.nome.trim();
    if (!this.tipos.includes(this.form.tipo)) return 'Selecione um tipo válido para a estrutura.';
    if (!nome) return 'Informe o nome da estrutura.';
    if (nome.length < 2) return 'O nome da estrutura precisa ter pelo menos 2 caracteres.';
    if (this.form.parentId && !this.nodes.some(n => n.id === this.form.parentId)) return 'A estrutura superior selecionada não existe mais.';

    const parentId = this.form.parentId || '';
    const nomeNormalizado = this.norm(nome);
    const duplicada = this.nodes.some(n =>
      n.id !== this.editingId &&
      this.norm(n.nome) === nomeNormalizado &&
      String(n.parentId || '') === parentId
    );
    if (duplicada) return 'Já existe uma estrutura com esse nome no mesmo nível.';

    const nomesReais = new Set<string>();
    for (const membro of this.membros) {
      const nomeMembro = String(membro?.nomePessoa || '').trim();
      if (!nomeMembro) return 'Remova ou corrija membros sem nome antes de salvar.';
      if (this.norm(nomeMembro) === this.norm(this.tbdNome)) {
        const cargo = String(membro?.papel || '').trim();
        if (!cargo) return 'Todo TBD precisa ter um cargo informado.';
        if (this.norm(cargo) === 'to be defined' || this.norm(cargo) === this.norm(this.tbdNome)) {
          return 'O subtítulo do TBD deve ser o cargo da vaga, não "To be defined".';
        }
        continue;
      }
      const key = this.norm(nomeMembro);
      if (nomesReais.has(key)) return `A pessoa "${nomeMembro}" foi adicionada mais de uma vez.`;
      nomesReais.add(key);
    }
    return '';
  }

  salvar() {
    const erro = this.validarCadastro();
    if (erro) {
      this.toast.show(erro, 'error');
      return;
    }
    const payload: any = {
      tipo: this.form.tipo,
      nome: this.form.nome.trim(),
      descricao: this.form.descricao.trim(),
      parentId: this.form.parentId || null,
      membros: this.membros.map(m => ({ personId: m.personId, nomePessoa: m.nomePessoa, papel: m.papel, cross: !!m.cross, vinculo: m.vinculo ?? null, percentual: m.percentual ?? null, subgrupo: m.subgrupo ?? null })),
      loIds: [...this.form.loIds]
    };
    if (this.editingId) this.update.emit({ id: this.editingId, ...payload });
    else this.create.emit(payload);
    this.cancelar();
  }

  excluir(node: HierarchyNode) {
    this.remove.emit(node.id);
    if (this.editingId === node.id) this.cancelar();
  }

  // ── Vínculo de LOs ──────────────────────────────────────────────────────
  losDisponiveis(): any[] {
    return [...this.linhasOrcamentarias].sort((a, b) => {
      const ano = Number(b?.ano || 0) - Number(a?.ano || 0);
      if (ano !== 0) return ano;
      return String(a?.codigo || a?.nome || '').localeCompare(String(b?.codigo || b?.nome || ''), 'pt-BR');
    });
  }

  loVinculada(loId: string): boolean {
    return this.form.loIds.includes(loId);
  }

  toggleLo(loId: string) {
    this.form.loIds = this.loVinculada(loId)
      ? this.form.loIds.filter(id => id !== loId)
      : [...this.form.loIds, loId];
  }

  somaLosForm(): number {
    return this.round2(this.form.loIds.reduce((s, id) => s + this.valorLoPorId(id), 0));
  }

  loLabel(loId: string): string {
    const lo = this.linhasOrcamentarias.find(l => l.id === loId);
    if (!lo) return loId;
    return lo.codigo || lo.nome || loId;
  }

  losDoNode(node: HierarchyNode): string[] {
    return node.loIds || [];
  }

  private round2(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  valorLoPorId(loId: string): number {
    const lo = this.linhasOrcamentarias.find(l => l.id === loId);
    if (!lo) return 0;
    const base = Number(lo.valorTotal || 0);
    const delta = (this.ajustes || [])
      .filter((a: any) => a.budgetLineId === loId)
      .reduce((s: number, a: any) => s + (String(a?.tipo || '').toUpperCase() === 'APORTE' ? Number(a?.valor || 0) : -Number(a?.valor || 0)), 0);
    return this.round2(base + delta);
  }

  // Conjunto de LOs do nó + de todos os descendentes (sem duplicar).
  private loIdsSubtree(node: HierarchyNode): Set<string> {
    const set = new Set<string>();
    const visitar = (n: HierarchyNode) => {
      (n.loIds || []).forEach(id => set.add(id));
      this.filhosDe(n.id).forEach(visitar);
    };
    visitar(node);
    return set;
  }

  // Valor agregado: soma das LOs do nó + LOs das estruturas filhas (ex: tribo = próprias + squads).
  valorAgregado(node: HierarchyNode): number {
    let total = 0;
    for (const id of this.loIdsSubtree(node)) total += this.valorLoPorId(id);
    return this.round2(total);
  }

  temValorAgregado(node: HierarchyNode): boolean {
    return this.loIdsSubtree(node).size > 0;
  }

  currency(value: number): string {
    return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Formato compacto: R$ 3,3 MM · R$ 545 k · R$ 980
  formatCompact(value: number): string {
    const v = Number(value) || 0;
    const abs = Math.abs(v);
    if (abs >= 1_000_000) {
      const n = v / 1_000_000;
      return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' MM';
    }
    if (abs >= 1_000) {
      const n = v / 1_000;
      return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' k';
    }
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // ── Alertas: pessoa fora da LO vinculada ────────────────────────────────
  membroForaDaLo(node: HierarchyNode, m: HierarchyMember): boolean {
    if (!m.personId && this.norm(m.nomePessoa) === this.norm(this.tbdNome)) return false;
    const ids = node.loIds || [];
    if (!ids.length) return false; // sem LO vinculada → sem alerta
    const nome = this.norm(m.nomePessoa);
    return !this.alocacoes.some((a: any) => ids.includes(a.linhaOrcamentariaId) && this.norm(a.nomePessoa) === nome);
  }

  nodeQtdAlertas(node: HierarchyNode): number {
    return (node.membros || []).filter(m => this.membroForaDaLo(node, m)).length;
  }

  // ── Gerar squad a partir de uma LO (importando pessoas) ─────────────────
  abrirGerar() { this.gerarAberto = true; this.gerarLoId = ''; this.gerarParentId = ''; }
  cancelarGerar() { this.gerarAberto = false; }

  private pessoasDaLo(loId: string): HierarchyMember[] {
    const seen = new Set<string>();
    const out: HierarchyMember[] = [];
    for (const a of this.alocacoes) {
      if (a.linhaOrcamentariaId !== loId) continue;
      if (a.draft) continue; // ignora rascunhos/planejadas
      const nome = String(a.nomePessoa || '').trim();
      if (!nome) continue;
      const key = this.norm(nome);
      if (seen.has(key)) continue;
      seen.add(key);
      const pessoa = this.pessoas.find(p => this.norm(p.nome) === key);
      out.push({ personId: pessoa?.id ?? null, nomePessoa: nome, papel: a.perfilNome || '', cross: false });
    }
    return out;
  }

  qtdPessoasDaLo(loId: string): number {
    return loId ? this.pessoasDaLo(loId).length : 0;
  }

  gerarSquadDaLo() {
    const lo = this.linhasOrcamentarias.find(l => l.id === this.gerarLoId);
    if (!lo) return;
    const membros = this.pessoasDaLo(lo.id);
    this.create.emit({
      tipo: 'SQUAD',
      nome: lo.codigo || lo.nome || 'Squad',
      descricao: lo.nome && lo.codigo ? lo.nome : '',
      parentId: this.gerarParentId || null,
      membros: membros.map(m => ({ personId: m.personId, nomePessoa: m.nomePessoa, papel: m.papel })),
      loIds: [lo.id]
    });
    this.gerarAberto = false;
    this.gerarLoId = '';
    this.gerarParentId = '';
  }

  // ── Drag & drop de pessoas entre estruturas ─────────────────────────────
  onMembroDragStart(node: HierarchyNode, index: number, ev: DragEvent) {
    this.dragOrigem = { nodeId: node.id, index };
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  onMembroDragEnd() {
    this.dragOrigem = null;
    this.dragOverNodeId = '';
  }

  onNodeDragOver(node: HierarchyNode, ev: DragEvent) {
    if (!this.dragOrigem) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    this.dragOverNodeId = node.id;
  }

  onNodeDragLeave(node: HierarchyNode) {
    if (this.dragOverNodeId === node.id) this.dragOverNodeId = '';
  }

  onNodeDrop(destino: HierarchyNode, ev: DragEvent) {
    ev.preventDefault();
    this.dragOverNodeId = '';
    const origem = this.dragOrigem;
    this.dragOrigem = null;
    if (!origem || origem.nodeId === destino.id) return;

    const nodeOrigem = this.nodes.find(n => n.id === origem.nodeId);
    if (!nodeOrigem) return;
    const membro = (nodeOrigem.membros || [])[origem.index];
    if (!membro) return;

    // Movimentação atômica no backend (evita corrida entre dois updates concorrentes).
    this.moveMember.emit({ fromNodeId: nodeOrigem.id, toNodeId: destino.id, nomePessoa: membro.nomePessoa });
  }

  // Remove uma pessoa do time diretamente na árvore.
  removerMembroDoNode(node: HierarchyNode, idx: number, ev: Event) {
    ev.stopPropagation();
    const membros = (node.membros || []).filter((_, i) => i !== idx);
    this.emitirAtualizacaoMembros(node, membros);
  }

  private emitirAtualizacaoMembros(node: HierarchyNode, membros: HierarchyMember[]) {
    this.update.emit({
      id: node.id,
      tipo: node.tipo,
      nome: node.nome,
      descricao: node.descricao || '',
      parentId: node.parentId || null,
      ordem: node.ordem,
      membros: membros.map(m => ({ personId: m.personId ?? null, nomePessoa: m.nomePessoa, papel: m.papel || '', cross: !!m.cross, vinculo: m.vinculo ?? null, percentual: m.percentual ?? null, subgrupo: m.subgrupo ?? null })),
      loIds: [...(node.loIds || [])]
    });
  }

  nodesParaExportar(): HierarchyNode[] {
    return [...this.nodes].sort((a, b) => {
      const tipo = this.tipos.indexOf(a.tipo) - this.tipos.indexOf(b.tipo);
      if (tipo !== 0) return tipo;
      return this.byOrdem(a, b);
    });
  }

  async exportar() {
    const selectedRoot = this.exportRootId
      ? this.nodes.find(n => n.id === this.exportRootId)
      : null;
    const raizes = selectedRoot ? [selectedRoot] : this.raizes();
    if (!raizes.length) return;

    const titulo = selectedRoot ? selectedRoot.nome : 'Hierarquia Organizacional';
    const arvoreHtml = raizes.map(r => this.renderNodeHtml(r)).join('');
    const dataStr = new Date().toLocaleDateString('pt-BR');
    const stage = document.createElement('div');
    stage.innerHTML = `
<style>
  .hierarchy-export, .hierarchy-export * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
  .hierarchy-export {
    width: max-content;
    min-width: 1600px;
    padding: 56px;
    color: #0f172a;
    background:
      radial-gradient(circle at 10% 8%, rgba(14,165,233,.20), transparent 28%),
      radial-gradient(circle at 88% 12%, rgba(124,58,237,.18), transparent 30%),
      linear-gradient(135deg, #f8fafc 0%, #eef6ff 48%, #ecfdf5 100%);
  }
  .sheet {
    min-width: 1488px;
    border-radius: 32px;
    background: rgba(255,255,255,.94);
    border: 1px solid rgba(148,163,184,.32);
    box-shadow: 0 28px 80px rgba(15,23,42,.16);
    padding: 44px 48px 52px;
  }
  .hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; margin-bottom: 42px; }
  .eyebrow { color: #2563eb; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; font-weight: 900; margin-bottom: 10px; }
  h1 { font-size: 44px; line-height: 1.05; margin: 0; letter-spacing: 0; color: #0f172a; }
  .sub { color: #64748b; font-size: 17px; margin-top: 10px; }
  .metrics { display: flex; gap: 12px; flex-wrap: nowrap; }
  .metric { min-width: 142px; border-radius: 20px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px 18px; }
  .metric span { display: block; color: #64748b; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .metric strong { display: block; color: #0f172a; font-size: 27px; line-height: 1.1; margin-top: 5px; }
  .tree-viewport { width: 100%; overflow: visible; }
  .tree { display: flex; gap: 40px; align-items: flex-start; justify-content: center; width: 100%; min-width: max-content; }
  .node { display: flex; flex-direction: column; align-items: center; }
  .card { border-radius: 18px; border: 1px solid #e2e8f0; padding: 16px 18px; min-width: 240px; max-width: 380px;
          box-shadow: 0 10px 28px rgba(15,23,42,.10); text-align: center; background: #fff; }
  .tipo { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 900; margin-bottom: 6px; }
  .nome { font-size: 17px; font-weight: 900; line-height: 1.22; }
  .desc { font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.35; }
  .t-PRESIDENCIA .tipo { color: #7c3aed; } .t-PRESIDENCIA > .card { border-top: 6px solid #7c3aed; }
  .t-DIRETORIA .tipo { color: #2563eb; } .t-DIRETORIA > .card { border-top: 6px solid #2563eb; }
  .t-TRIBO .tipo { color: #0891b2; } .t-TRIBO > .card { border-top: 6px solid #0891b2; }
  .t-SQUAD .tipo { color: #059669; } .t-SQUAD > .card { border-top: 6px solid #059669; }
  .membros { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .grupo { border-radius: 12px; padding: 8px 10px; text-align: left; }
  .grupo.g-cross { background: #fff7ed; border: 1px solid #fed7aa; }
  .grupo.g-folha { background: #eff6ff; }
  .grupo.g-terceiro { background: #ecfeff; }
  .grupo-head { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
  .g-cross .grupo-head { color: #c2410c; }
  .g-folha .grupo-head { color: #1d4ed8; }
  .g-terceiro .grupo-head { color: #0e7490; }
  .grupo-count { background: rgba(15,23,42,.08); color: #334155; border-radius: 10px; padding: 0 6px; font-size: 9px; }
  .grupo-lista { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; }
  .m { display: flex; align-items: center; gap: 7px; font-size: 12px; text-align: left; margin-top: 5px; min-width: 0; }
  .m-info { min-width: 0; } .m-nome, .meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m-info { display: flex; flex-direction: column; line-height: 1.2; }
  .m-nome { font-weight: 700; color: #1e293b; }
  .meta { color: #64748b; font-size: 10px; }
  .av { width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex: 0 0 28px;
        display: inline-flex; align-items: center; justify-content: center; background: #eef2ff; color: #4338ca; font-size: 10px; font-weight: 900; }
  .av img { width: 100%; height: 100%; object-fit: cover; }
  .g-cross .av { box-shadow: 0 0 0 2px #fdba74; }
  .g-folha .av { box-shadow: 0 0 0 2px #bfdbfe; }
  .g-terceiro .av { box-shadow: 0 0 0 2px #a5f3fc; }
  .equipe { text-align: left; margin-top: 6px; }
  .equipe-head { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: 5px; }
  .equipe-avatars { display: flex; flex-wrap: wrap; }
  .eq-av { width: 30px; height: 30px; flex: 0 0 30px; margin-right: -7px; margin-bottom: 5px; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(15,23,42,.18); }
  .eq-more { background: #e2e8f0; color: #475569; }
  .children { display: flex; gap: 30px; margin-top: 24px; padding-top: 26px; position: relative; flex-wrap: nowrap; justify-content: center; }
  .children::before { content: ''; position: absolute; top: 0; left: 50%; width: 2px; height: 26px; background: #cbd5e1; }
  .footer { margin-top: 42px; display: flex; justify-content: center; color: #64748b; font-size: 13px; }
</style>
<section class="hierarchy-export">
  <div class="sheet">
    <header class="hero">
      <div>
        <div class="eyebrow">Organograma</div>
        <h1>${this.escapeHtml(titulo)}</h1>
        <div class="sub">${selectedRoot ? this.escapeHtml(this.tipoLabel(selectedRoot.tipo)) + ' · ' : ''}Exportado em ${dataStr}</div>
      </div>
      <div class="metrics">
        <div class="metric"><span>Estruturas</span><strong>${this.countSubtreeNodes(raizes)}</strong></div>
        <div class="metric"><span>Pessoas</span><strong>${this.countSubtreePessoas(raizes)}</strong></div>
        <div class="metric"><span>Raízes</span><strong>${raizes.length}</strong></div>
      </div>
    </header>
    <div class="tree-viewport"><div class="tree">${arvoreHtml}</div></div>
    <div class="footer">Planner · apresentação em PNG</div>
  </div>
</section>`;

    const host = document.createElement('div');
    Object.assign(host.style, {
      position: 'fixed',
      top: '-100000px',
      left: '-100000px',
      zIndex: '-1',
      pointerEvents: 'none',
    });
    host.appendChild(stage);
    document.body.appendChild(host);

    try {
      const { default: html2canvas } = await import('html2canvas');
      await this.waitForExportImages(stage);
      const exportEl = stage.querySelector<HTMLElement>('.hierarchy-export');
      if (!exportEl) return;
      const canvas = await html2canvas(exportEl, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        width: exportEl.scrollWidth,
        height: exportEl.scrollHeight,
        windowWidth: exportEl.scrollWidth,
        windowHeight: exportEl.scrollHeight,
      });
      const link = document.createElement('a');
      link.download = `hierarquia_${this.safeFilePart(titulo)}_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      document.body.removeChild(host);
    }
  }

  private waitForExportImages(root: HTMLElement): Promise<void> {
    const images = Array.from(root.querySelectorAll('img'));
    if (!images.length) return Promise.resolve();
    return Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>(resolve => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    })).then(() => undefined);
  }

  private countSubtreeNodes(roots: HierarchyNode[]): number {
    let total = 0;
    const visit = (node: HierarchyNode) => {
      total++;
      this.filhosDe(node.id).forEach(visit);
    };
    roots.forEach(visit);
    return total;
  }

  private countSubtreePessoas(roots: HierarchyNode[]): number {
    const pessoas = new Set<string>();
    const visit = (node: HierarchyNode) => {
      (node.membros || []).forEach(m => pessoas.add(this.norm(m.nomePessoa)));
      this.filhosDe(node.id).forEach(visit);
    };
    roots.forEach(visit);
    return pessoas.size;
  }

  private safeFilePart(value: string): string {
    return String(value || 'hierarquia')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'hierarquia';
  }

  // ── Exportação para apresentação (abre janela e imprime/salva PDF) ──────
  exportarImpressao() {
    const raizes = this.raizes();
    if (!raizes.length) return;
    const arvoreHtml = raizes.map(r => this.renderNodeHtml(r)).join('');
    const dataStr = new Date().toLocaleDateString('pt-BR');
    const doc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Hierarquia Organizacional</title>
<style>
  * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
  body { margin: 0; padding: 32px; background: #fff; color: #0f172a; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 28px; }
  .tree { display: flex; gap: 36px; align-items: flex-start; flex-wrap: wrap; }
  .node { display: flex; flex-direction: column; align-items: center; }
  .card { border-radius: 12px; border: 1px solid #e2e8f0; padding: 12px 16px; min-width: 210px; max-width: 340px;
          box-shadow: 0 2px 8px rgba(15,23,42,.06); text-align: center; background: #fff; }
  .tipo { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
  .nome { font-size: 14px; font-weight: 700; }
  .desc { font-size: 11px; color: #64748b; margin-top: 2px; }
  .valor { font-size: 11px; color: #475569; margin-top: 4px; } .valor strong { color: #0f766e; }
  .t-PRESIDENCIA .tipo { color: #7c3aed; } .t-PRESIDENCIA .card { border-top: 4px solid #7c3aed; }
  .t-DIRETORIA .tipo { color: #2563eb; } .t-DIRETORIA .card { border-top: 4px solid #2563eb; }
  .t-TRIBO .tipo { color: #0891b2; } .t-TRIBO .card { border-top: 4px solid #0891b2; }
  .t-SQUAD .tipo { color: #059669; } .t-SQUAD .card { border-top: 4px solid #059669; }
  .membros { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .grupo { border-radius: 8px; padding: 5px 7px; text-align: left; }
  .grupo.g-cross { background: #fff7ed; border: 1px solid #fed7aa; } .grupo.g-folha { background: #eff6ff; } .grupo.g-terceiro { background: #ecfeff; }
  .grupo-head { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
  .g-cross .grupo-head { color: #c2410c; } .g-folha .grupo-head { color: #1d4ed8; } .g-terceiro .grupo-head { color: #0e7490; }
  .grupo-count { background: rgba(15,23,42,.08); color: #334155; border-radius: 10px; padding: 0 5px; font-size: 8px; }
  .grupo-lista { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 10px; }
  .m { display: flex; align-items: center; gap: 6px; font-size: 11px; text-align: left; margin-top: 3px; min-width: 0; }
  .m-info { min-width: 0; } .m-nome, .meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m-info { display: flex; flex-direction: column; line-height: 1.2; }
  .m-nome { font-weight: 700; color: #1e293b; }
  .meta { color: #64748b; font-size: 9px; }
  .av { width: 22px; height: 22px; border-radius: 50%; overflow: hidden; flex: 0 0 22px;
        display: inline-flex; align-items: center; justify-content: center; background: #eef2ff; color: #4338ca; font-size: 9px; font-weight: 700; }
  .av img { width: 100%; height: 100%; object-fit: cover; }
  .equipe { text-align: left; margin-top: 6px; }
  .equipe-head { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #475569; margin-bottom: 4px; }
  .equipe-avatars { display: flex; flex-wrap: wrap; }
  .eq-av { width: 24px; height: 24px; flex: 0 0 24px; margin-right: -6px; margin-bottom: 4px; border: 2px solid #fff; }
  .eq-more { background: #e2e8f0; color: #475569; }
  .children { display: flex; gap: 24px; margin-top: 18px; padding-top: 18px; position: relative; flex-wrap: wrap; justify-content: center; }
  .children::before { content: ''; position: absolute; top: 0; left: 50%; width: 1px; height: 18px; background: #cbd5e1; }
  @media print { body { padding: 12px; } .tree { gap: 20px; } }
</style></head><body>
  <h1>Hierarquia Organizacional</h1>
  <div class="sub">Exportado em ${dataStr}</div>
  <div class="tree">${arvoreHtml}</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(doc);
    win.document.close();
  }

  private escapeHtml(s: string): string {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  }

  private renderMembroHtml(m: HierarchyMember): string {
    const foto = this.fotoDe(m.nomePessoa);
    const av = foto
      ? `<span class="av"><img src="${foto}" alt="" /></span>`
      : `<span class="av">${this.escapeHtml(this.iniciais(m.nomePessoa))}</span>`;
    const meta = this.metaDoMembro(m);
    const metaHtml = meta ? `<span class="meta">${this.escapeHtml(meta)}</span>` : '';
    return `<div class="m">${av}<div class="m-info"><span class="m-nome">${this.escapeHtml(m.nomePessoa)}</span>${metaHtml}</div></div>`;
  }

  private renderGrupoHtml(node: HierarchyNode, grupo: string, titulo: string, cls: string): string {
    const itens = this.membrosPorGrupo(node, grupo);
    if (!itens.length) return '';
    const linhas = itens.map(x => this.renderMembroHtml(x.m)).join('');
    return `<div class="grupo ${cls}"><div class="grupo-head">${this.escapeHtml(titulo)} <span class="grupo-count">${this.escapeHtml(this.resumoGrupoSquad(node, grupo))}</span></div><div class="grupo-lista">${linhas}</div></div>`;
  }

  private renderNodeHtml(node: HierarchyNode): string {
    const grupos = `${this.renderGrupoHtml(node, 'cross', 'Cross', 'g-cross')}${this.renderGrupoHtml(node, 'folha', 'Folha', 'g-folha')}${this.renderGrupoHtml(node, 'terceiro', 'Terceiros', 'g-terceiro')}`;
    const filhos = this.filhosDe(node.id);
    const filhosHtml = filhos.length ? `<div class="children">${filhos.map(f => this.renderNodeHtml(f)).join('')}</div>` : '';
    const desc = node.descricao ? `<div class="desc">${this.escapeHtml(node.descricao)}</div>` : '';
    const membrosBlock = grupos ? `<div class="membros">${grupos}</div>` : '';
    const valor = (this.temValorAgregado(node) && !this.ocultarValoresExport)
      ? `<div class="valor">Σ LOs: <strong>${this.escapeHtml(this.formatCompact(this.valorAgregado(node)))}</strong></div>`
      : '';
    return `<div class="node t-${node.tipo}">
      <div class="card">
        <div class="tipo">${this.escapeHtml(this.tipoLabel(node.tipo))}</div>
        <div class="nome">${this.escapeHtml(node.nome)}</div>
        ${desc}${valor}${membrosBlock}
      </div>
      ${filhosHtml}
    </div>`;
  }
}
