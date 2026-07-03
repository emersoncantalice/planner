// @ts-nocheck
import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, EventEmitter, HostListener, inject, NgZone, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';
import { ToastService } from '../../core/toast.service';
import { ScrollIntoViewWhenDirective } from '../../core/scroll-into-view-when.directive';

interface HierarchyMember { personId: string | null; nomePessoa: string; papel: string; cross?: boolean; vinculo?: string | null; percentual?: number | null; subgrupo?: string | null; }
interface HierarchyNode { id: string; tipo: string; tipoRotulo?: string | null; nome: string; descricao?: string; parentId?: string | null; parentIds?: string[] | null; ordem?: number; membros?: HierarchyMember[]; loIds?: string[]; }
interface LinhaConector { id: string; de: string; para: string; x1: number; y1: number; x2: number; y2: number; d: string; }

const U = inject;
const G = EventEmitter;
const it = ToastService;
// Helpers de spread (__spreadValues/__spreadProps) usados no corpo minificado da classe.
const $ = (a: any, b: any) => Object.assign(a, b);
const Y = (a: any, b: any) => Object.assign(a, b);

@Component({
  selector: 'app-hierarchy-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollIntoViewWhenDirective, SearchableSelectDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './hierarchy-panel.component.html',
  styleUrl: './hierarchy-panel.component.scss',
  inputs: ['nodes', 'pessoas', 'perfis', 'fotos', 'percentuais', 'linhasOrcamentarias', 'ajustes', 'alocacoes', 'projetos'],
  outputs: ['create', 'update', 'remove', 'moveMember']
})
export class HierarchyPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('treeContainer') treeContainer?: ElementRef<HTMLElement>;
  linhas: LinhaConector[] = [];
  svgW = 0;
  svgH = 0;
  private resizeObs?: ResizeObserver;
  private recalcAgendado = false;

  // ── Zoom & pan (arraste) da árvore ─────────────────────────────────────────
  zoom = 1;
  panX = 0;
  panY = 0;
  isPanning = false;
  private panStart = { x: 0, y: 0, px: 0, py: 0 };
  private readonly zoomMin = 0.3;
  private readonly zoomMax = 2;

  get treeTransform(): string {
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      window.addEventListener('resize', this.agendarRecalcLinhas, true);
      const cont = this.treeContainer?.nativeElement;
      if (cont) {
        cont.addEventListener('scroll', this.agendarRecalcLinhas, true);
        try {
          this.resizeObs = new ResizeObserver(() => this.agendarRecalcLinhas());
          this.resizeObs.observe(cont);
        } catch { }
      }
    });
    this.agendarRecalcLinhas();
  }

  ngOnChanges(): void { this.agendarRecalcLinhas(); }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.agendarRecalcLinhas, true);
    this.treeContainer?.nativeElement.removeEventListener('scroll', this.agendarRecalcLinhas, true);
    this.resizeObs?.disconnect();
    document.removeEventListener('mousemove', this.onPanMoveDoc, true);
    document.removeEventListener('mouseup', this.onPanUpDoc, true);
  }

  agendarRecalcLinhas = () => {
    if (this.recalcAgendado) return;
    this.recalcAgendado = true;
    this.zone.runOutsideAngular(() => requestAnimationFrame(() => {
      this.recalcAgendado = false;
      this.recomputeLinhas();
    }));
  };

  private recomputeLinhas(): void {
    const cont = this.treeContainer?.nativeElement;
    if (!cont) return;
    const crect = cont.getBoundingClientRect();
    // O SVG e os cards vivem dentro de .tree (que recebe translate/scale juntos),
    // então as linhas usam coordenadas lógicas: dividimos a distância em tela pelo zoom.
    const z = this.zoom || 1;
    const novas: LinhaConector[] = [];
    for (const n of this.nodes) {
      const childEl = cont.querySelector<HTMLElement>(`.node-card[data-node-id="${n.id}"]`);
      if (!childEl) continue;
      const cr = childEl.getBoundingClientRect();
      const x2 = (cr.left + cr.width / 2 - crect.left) / z;
      const y2 = (cr.top - crect.top) / z;
      for (const pid of this.paisDe(n)) {
        const parentEl = cont.querySelector<HTMLElement>(`.node-card[data-node-id="${pid}"]`);
        if (!parentEl) continue;
        const pr = parentEl.getBoundingClientRect();
        const x1 = (pr.left + pr.width / 2 - crect.left) / z;
        const y1 = (pr.bottom - crect.top) / z;
        novas.push({ id: `${pid}->${n.id}`, de: pid, para: n.id, x1, y1, x2, y2, d: '' });
      }
    }
    this.aplicarSaltos(novas);
    const w = cont.scrollWidth, h = cont.scrollHeight;
    const mudou = w !== this.svgW || h !== this.svgH || JSON.stringify(novas) !== JSON.stringify(this.linhas);
    if (!mudou) return;
    this.zone.run(() => {
      this.linhas = novas;
      this.svgW = w;
      this.svgH = h;
      this.cdr.markForCheck();
    });
  }

  private pontosDaLinha(l: LinhaConector): { x: number; y: number }[] {
    if (Math.abs(l.x1 - l.x2) < 0.5) return [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }];
    const midY = (l.y1 + l.y2) / 2;
    return [{ x: l.x1, y: l.y1 }, { x: l.x1, y: midY }, { x: l.x2, y: midY }, { x: l.x2, y: l.y2 }];
  }

  private aplicarSaltos(linhas: LinhaConector[]): void {
    const R = 5;
    const EPS = 1.5;
    const pontos = new Map<string, { x: number; y: number }[]>();
    const verticais: { x: number; ya: number; yb: number; id: string }[] = [];
    for (const l of linhas) {
      const pts = this.pontosDaLinha(l);
      pontos.set(l.id, pts);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5) {
          verticais.push({ x: a.x, ya: Math.min(a.y, b.y), yb: Math.max(a.y, b.y), id: l.id });
        }
      }
    }
    for (const l of linhas) {
      const pts = pontos.get(l.id)!;
      let d = `M ${this.r(pts[0].x)} ${this.r(pts[0].y)}`;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const horizontal = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5;
        if (!horizontal) { d += ` L ${this.r(b.x)} ${this.r(b.y)}`; continue; }
        const y = a.y, dir = b.x > a.x ? 1 : -1;
        const xmin = Math.min(a.x, b.x), xmax = Math.max(a.x, b.x);
        const cruz = verticais
          .filter(v => v.id !== l.id && v.x > xmin + EPS && v.x < xmax - EPS && y > v.ya + EPS && y < v.yb - EPS)
          .map(v => v.x)
          .sort((p, q) => dir * (p - q));
        for (const xc of cruz) {
          d += ` L ${this.r(xc - dir * R)} ${this.r(y)}`;
          d += ` A ${R} ${R} 0 0 ${dir > 0 ? 0 : 1} ${this.r(xc + dir * R)} ${this.r(y)}`;
        }
        d += ` L ${this.r(b.x)} ${this.r(b.y)}`;
      }
      l.d = d;
    }
  }

  private r(n: number): number { return Math.round(n * 10) / 10; }

  onHierarchyLayoutChange() {
    this.vinculoDestacado = null;
    this.linhas = [];
    this.svgW = 0;
    this.svgH = 0;
    this.agendarRecalcLinhas();
  }

  onExportRootChange() { this.onHierarchyLayoutChange(); }

  // ── Navegação: arrastar para mover + zoom ──────────────────────────────────
  onTreePanStart(ev: MouseEvent): void {
    if (ev.button !== 0) return;
    const t = ev.target as HTMLElement | null;
    // Não inicia o arraste em elementos interativos (membros arrastáveis, botões, linhas, etc.).
    if (t && t.closest('.node-m, button, input, select, textarea, a, .conector-hit, [draggable="true"]')) return;
    this.isPanning = true;
    this.panStart = { x: ev.clientX, y: ev.clientY, px: this.panX, py: this.panY };
    ev.preventDefault();
    // Listeners só durante o arraste (evita custo global de change detection).
    this.zone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.onPanMoveDoc, true);
      document.addEventListener('mouseup', this.onPanUpDoc, true);
    });
  }

  private onPanMoveDoc = (ev: MouseEvent): void => {
    if (!this.isPanning) return;
    this.panX = this.panStart.px + (ev.clientX - this.panStart.x);
    this.panY = this.panStart.py + (ev.clientY - this.panStart.y);
    this.zone.run(() => this.cdr.markForCheck());
  };

  private onPanUpDoc = (): void => {
    if (!this.isPanning) return;
    this.isPanning = false;
    document.removeEventListener('mousemove', this.onPanMoveDoc, true);
    document.removeEventListener('mouseup', this.onPanUpDoc, true);
    this.zone.run(() => { this.agendarRecalcLinhas(); this.cdr.markForCheck(); });
  };

  onTreeWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const wrap = ev.currentTarget as HTMLElement;
    const rect = wrap.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const fator = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.aplicarZoom(this.zoom * fator, cx, cy);
  }

  zoomIn(): void  { this.aplicarZoomCentral(this.zoom * 1.15); }
  zoomOut(): void { this.aplicarZoomCentral(this.zoom / 1.15); }
  zoomReset(): void { this.zoom = 1; this.panX = 0; this.panY = 0; this.agendarRecalcLinhas(); }
  zoomPct(): number { return Math.round(this.zoom * 100); }

  private aplicarZoomCentral(z: number): void {
    const wrap = this.treeContainer?.nativeElement?.parentElement;
    const rect = wrap?.getBoundingClientRect();
    this.aplicarZoom(z, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2);
  }

  // Mantém o ponto sob o cursor (cx,cy em px relativos ao .tree-wrap) estável ao dar zoom.
  private aplicarZoom(z: number, cx: number, cy: number): void {
    const novo = Math.min(this.zoomMax, Math.max(this.zoomMin, Math.round(z * 100) / 100));
    if (novo === this.zoom) return;
    const lx = (cx - this.panX) / this.zoom;
    const ly = (cy - this.panY) / this.zoom;
    this.panX = cx - lx * novo;
    this.panY = cy - ly * novo;
    this.zoom = novo;
    this.agendarRecalcLinhas();
  }

  parentSearchTerm = '';
  parentDropdownOpen = false;
  loSearchTerm = '';
  loDropdownOpen = false;
  projSearchTerm = '';
  projDropdownOpen = false;

  // ── Multi-select de LOs (mesmo padrão das estruturas superiores) ───────────
  loResumo(): string {
    if (!this.form?.loIds?.length) return 'Nenhuma LO';
    return this.form.loIds.map((id: string) => this.loLabel(id)).join(', ');
  }
  losFiltrados(): any[] {
    const q = this.norm(this.loSearchTerm);
    const lista = this.losDisponiveis();
    if (!q) return lista;
    return lista.filter((lo: any) => this.norm(`${lo?.codigo || ''} ${lo?.nome || ''}`).includes(q));
  }
  limparLos(): void { this.form.loIds = []; }

  // ── Multi-select de Projetos ──────────────────────────────────────────────
  projetoResumo(): string {
    if (!this.form?.projetoIds?.length) return 'Nenhum projeto';
    return this.form.projetoIds.map((id: string) => this.projetoNome(id)).join(', ');
  }
  projetosFiltrados(): any[] {
    const q = this.norm(this.projSearchTerm);
    const lista = this.projetosDisponiveis();
    if (!q) return lista;
    return lista.filter((p: any) => this.norm(p?.nome || '').includes(q));
  }
  limparProjetos(): void { this.form.projetoIds = []; }
  /** Verdadeiro se o projeto está vinculado a mais de um time (tribo/squad). */
  projetoCompartilhado(id: string): boolean {
    return (this.nodes || []).filter((n: any) =>
      this.mostrarProjetos(n) && (n.projetoIds || []).includes(id)).length > 1;
  }

  /** Fecha os multi-selects (estruturas/LOs/projetos) ao clicar fora deles. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.parentDropdownOpen && !this.loDropdownOpen && !this.projDropdownOpen) return;
    const alvo = ev.target as HTMLElement | null;
    if (alvo && alvo.closest('.multi-select')) return; // clique dentro de algum multi-select
    this.parentDropdownOpen = false;
    this.loDropdownOpen = false;
    this.projDropdownOpen = false;
  }

  parentResumo(): string {
    if (!this.form?.parentIds?.length) return 'Nenhuma (raiz)';
    return this.form.parentIds.map((id: string) => this.nomePorId(id) || id).join(', ');
  }

  paisFiltrados(): any[] {
    const q = this.norm(this.parentSearchTerm);
    const lista = this.paisDisponiveis();
    if (!q) return lista;
    return lista.filter((n: any) => this.norm(`${this.rotuloNode(n)} ${n.nome}`).includes(q));
  }

  limparPais(): void {
    this.form.parentIds = [];
  }

  // Loading da geração da imagem (export PNG é pesado e bloqueia a thread).
  exportando = false;
  async exportarComLoading(): Promise<void> {
    if (this.exportando) return;
    this.exportando = true;
    this.cdr.markForCheck();
    // Overlay anexado ao body (escapa de ancestrais com transform/overflow que
    // recortariam um position:fixed dentro do componente).
    const ov = document.createElement('div');
    ov.className = 'hier-export-overlay';
    ov.innerHTML = '<div class="hier-export-box"><span class="hier-export-spinner"></span><span>Gerando imagem da hierarquia...</span></div>';
    document.body.appendChild(ov);
    // deixa o overlay pintar antes do trabalho pesado do html2canvas
    await new Promise(res => setTimeout(res, 50));
    try {
      await this.exportar();
    } finally {
      ov.remove();
      this.exportando = false;
      this.cdr.markForCheck();
    }
  }

  // ── Projetos vinculados (tribos/squads) ───────────────────────────────────
  /** Projetos só podem ser associados a estruturas de time (tribos e squads). */
  mostrarProjetos(node: any): boolean { return this.tipoPermiteMarcacoesDeTime(node?.tipo); }
  projetosDisponiveis(): any[] {
    return [...(this.projetos || [])].sort((a: any, b: any) =>
      String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'));
  }
  projetoPorId(id: string): any | null { return (this.projetos || []).find((p: any) => p?.id === id) || null; }
  projetoNome(id: string): string { const p = this.projetoPorId(id); return p ? p.nome : id; }
  projetoVinculado(id: string): boolean { return (this.form.projetoIds || []).includes(id); }
  toggleProjeto(id: string): void {
    if (this.projetoVinculado(id)) {
      this.form.projetoIds = this.form.projetoIds.filter((x: string) => x !== id);
      // ao desvincular, limpa eventual marcação de oculto
      this.form.projetosOcultos = (this.form.projetosOcultos || []).filter((x: string) => x !== id);
    } else {
      this.form.projetoIds = [...(this.form.projetoIds || []), id];
    }
  }
  /** Objetos de projeto vinculados a um node (ignora ids que não existem mais). */
  projetosDoNode(node: any): any[] {
    return (node?.projetoIds || []).map((id: string) => this.projetoPorId(id)).filter((p: any) => !!p);
  }
  /** Projetos vinculados e visíveis (exclui os marcados como ocultos neste time). */
  projetosVisiveisDoNode(node: any): any[] {
    const ocultos: string[] = node?.projetosOcultos || [];
    return this.projetosDoNode(node).filter((p: any) => !ocultos.includes(p.id));
  }
  /** No formulário: o projeto vinculado está marcado como oculto neste time? */
  projetoOculto(id: string): boolean { return (this.form.projetosOcultos || []).includes(id); }
  toggleProjetoOculto(id: string): void {
    this.form.projetosOcultos = this.projetoOculto(id)
      ? this.form.projetosOcultos.filter((x: string) => x !== id)
      : [...(this.form.projetosOcultos || []), id];
  }
  /** Percentual de conclusão do projeto (0–100, arredondado). */
  projetoPct(p: any): number {
    const v = Number(p?.percentualConclusao);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
  }
  alternarOcultarProjetos(): void { this.onHierarchyLayoutChange(); }

  /** Formata o percentual de alocação com 2 casas decimais (pt-BR). */
  formatPct(v: any): string {
    return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Soma a alocação (%) de uma pessoa em todas as estruturas de time. */
  alocacaoTotalPessoa(nomeOuMembro: any): number {
    const nome = typeof nomeOuMembro === 'string' ? nomeOuMembro : nomeOuMembro?.nomePessoa;
    const key = this.norm(nome);
    if (!key || key === this.norm(this.tbdNome)) return 0; // TBD não soma (vários compartilham o nome)
    let total = 0;
    for (const n of this.nodes) {
      if (!this.mostrarMarcacoesDeTime(n)) continue;
      for (const m of (n.membros || [])) {
        if (this.norm(m.nomePessoa) === key) total += this.percentualPessoa(m) ?? 0;
      }
    }
    return Math.round(total * 100) / 100;
  }

  /** Pessoa com alocação somada acima de 100% (super-alocada) — precisa de correção. */
  pessoaSuperAlocada(m: any): boolean {
    return this.alocacaoTotalPessoa(m) > 100;
  }

  // ── FTE Total do time (somatória de folha + terceiros) ────────────────────
  /** Soma o FTE da estrutura e de todas as descendentes (tribo agrega seus squads). */
  fteTotalNode(node: any): number {
    if (!this.mostrarMarcacoesDeTime(node)) return 0;
    // Total geral = soma dos grupos de perfil (mesma regra: Team Member filtra contaFte).
    return this.ftePorPerfilNode(node).reduce((s, g) => s + g.fte, 0);
  }
  /**
   * Classifica o perfil/papel do membro em um grupo de contagem de FTE.
   * IT Lead, PM, QA e Arquitetura contam isoladamente; os demais somam em "Team Member".
   */
  classificaPerfilFte(m: any): string {
    const p = this.norm(this.papelDoMembro(m));
    if (!p) return 'Team Member';
    if (p.includes('it lead') || p.includes('itlead') || p.includes('tech lead')) return 'IT Lead';
    if (p === 'pm' || p.startsWith('pm ') || p.includes('product manager')) return 'PM';
    if (p === 'qa' || p.startsWith('qa ') || p.startsWith('qa-') || p.includes('quality')) return 'QA';
    // Arquitetura = perfis ASW e ANS
    if (p === 'asw' || p === 'ans' || p.startsWith('asw ') || p.startsWith('ans ')
        || p.startsWith('asw-') || p.startsWith('ans-') || p.includes('arquitet')) return 'Arquitetura';
    return 'Team Member';
  }

  /** Apenas squads contam para o FTE — tribos agregam os squads abaixo, sem somar seus próprios membros. */
  ehSquad(n: any): boolean { return this.tipoNormalizado(n?.tipo) === 'SQUAD'; }

  /**
   * Contribuição de FTE de um membro (alocação ponderada).
   * Team Member só conta quem conta FTE no cadastro; papéis nomeados contam sempre.
   */
  fteContribuicaoMembro(m: any): number {
    const g = this.classificaPerfilFte(m);
    const base = (this.percentualPessoa(m) ?? 100) / 100; // alocação
    return (g === 'Team Member') ? (this.membroContaFte(m) ? base : 0) : base;
  }

  /** FTE por grupo de perfil na estrutura (agrega a subárvore, como o FTE Total). */
  ftePorPerfilNode(node: any): Array<{ label: string; fte: number }> {
    if (!this.mostrarMarcacoesDeTime(node)) return [];
    const ids = this.subtree(node.id);
    const acc: Record<string, number> = { 'IT Lead': 0, 'PM': 0, 'QA': 0, 'Arquitetura': 0, 'Team Member': 0 };
    for (const n of this.nodes) {
      if (!ids.has(n.id) || !this.contaFtePropria(n)) continue;
      for (const m of (n.membros || [])) acc[this.classificaPerfilFte(m)] += this.fteContribuicaoMembro(m);
    }
    return ['IT Lead', 'PM', 'QA', 'Arquitetura', 'Team Member']
      .filter(k => acc[k] > 0)
      .map(k => ({ label: k, fte: acc[k] }));
  }

  // ── Modal de detalhamento de FTE (squad/tribo) ────────────────────────────
  fteDetalheNode: any = null;
  abrirFteDetalhe(node: any, ev?: Event): void { ev?.stopPropagation(); this.fteDetalheNode = node; }
  fecharFteDetalhe(): void { this.fteDetalheNode = null; }

  /** FTE por vínculo (folha/terceiros) agregado na subárvore, com a participação %. */
  fteDetalheVinculo(node: any): Array<{ label: string; fte: number; pct: number }> {
    if (!this.mostrarMarcacoesDeTime(node)) return [];
    const ids = this.subtree(node.id);
    let folha = 0, terc = 0;
    for (const n of this.nodes) {
      if (!ids.has(n.id) || !this.contaFtePropria(n)) continue;
      for (const m of (n.membros || [])) {
        const c = this.fteContribuicaoMembro(m);
        if (this.ehTerceiro(m)) terc += c; else folha += c;
      }
    }
    const tot = folha + terc;
    return [
      { label: 'Folha', fte: folha, pct: tot ? Math.round(folha / tot * 100) : 0 },
      { label: 'Terceiros', fte: terc, pct: tot ? Math.round(terc / tot * 100) : 0 },
    ].filter(v => v.fte > 0);
  }

  /** Nomes fictícios para os TBD (To Be Defined). */
  private readonly tbdNomesPool = ['Fulano', 'Beltrano', 'Sicrano', 'Fulana', 'Beltrana', 'Sicrana', 'Deltrano', 'Zacarias', 'Joana', 'Mévio'];
  private nomeTbdFicticio(i: number): string {
    const base = this.tbdNomesPool[i % this.tbdNomesPool.length];
    const ciclo = Math.floor(i / this.tbdNomesPool.length);
    return ciclo > 0 ? `${base} ${ciclo + 1}` : base;
  }

  /**
   * Lista de pessoas do detalhamento de FTE (subárvore, só squads):
   * agrupa pessoas reais por nome + cargo; cada TBD vira uma "pessoa" com nome fictício editável;
   * sinaliza quem tem alocação total ≠ 100%.
   */
  fteDetalhePessoas(node: any): Array<any> {
    if (!this.mostrarMarcacoesDeTime(node)) return [];
    const ids = this.subtree(node.id);
    const grupos = new Map<string, any>();
    const tbds: any[] = [];
    let tbdCount = 0;
    for (const n of this.nodes) {
      if (!ids.has(n.id) || !this.contaFtePropria(n)) continue;
      const membros = n.membros || [];
      for (let idx = 0; idx < membros.length; idx++) {
        const m = membros[idx];
        const aloc = this.percentualPessoa(m) ?? 100;
        const fte = this.fteContribuicaoMembro(m);
        const papel = this.papelDoMembro(m) || '—';
        const vinculo = this.ehTerceiro(m) ? 'Terceiro' : 'Folha';
        const grupo = this.classificaPerfilFte(m);
        const ehTbd = this.norm(m.nomePessoa) === this.norm(this.tbdNome);
        if (ehTbd) {
          const total = Math.round(aloc * 100) / 100;
          tbds.push({
            nome: this.nomeTbdFicticio(tbdCount++), papel, grupo, vinculo,
            estruturas: n.nome, alocacaoTotal: total, fte, contaFte: this.membroContaFte(m),
            tbd: true, refKey: `${n.id}:${idx}`, ref: { nodeId: n.id, idx },
            alerta: total !== 100,
          });
        } else {
          const key = this.norm(m.nomePessoa) + '|' + this.norm(papel);
          let row = grupos.get(key);
          if (!row) {
            const total = this.alocacaoTotalPessoa(m.nomePessoa);
            row = {
              nome: m.nomePessoa, papel, grupo, vinculo, estruturasSet: new Set<string>(),
              alocacaoTotal: total, fte: 0, contaFte: this.membroContaFte(m),
              tbd: false, ref: null, alerta: Math.round(total * 100) / 100 !== 100,
            };
            grupos.set(key, row);
          }
          row.estruturasSet.add(n.nome);
          row.fte += fte;
        }
      }
    }
    const reais = Array.from(grupos.values()).map(r => ({ ...r, estruturas: [...r.estruturasSet].join(', ') }));
    return [...reais, ...tbds].sort((a, b) =>
      a.grupo.localeCompare(b.grupo, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // ── Edição de nome de TBD no detalhamento ─────────────────────────────────
  editTbdKey: string | null = null;
  editTbdValue = '';
  iniciarEdicaoNomeTbd(row: any): void { this.editTbdKey = row.refKey; this.editTbdValue = row.nome; }
  cancelarEdicaoNomeTbd(): void { this.editTbdKey = null; this.editTbdValue = ''; }
  salvarNomeTbd(row: any): void {
    if (this.editTbdKey !== row.refKey) return;
    const novo = (this.editTbdValue || '').trim();
    this.editTbdKey = null; this.editTbdValue = '';
    if (!novo) return;
    const node = this.nodes.find((n: any) => n.id === row.ref.nodeId);
    if (!node) return;
    const membros = (node.membros || []).map((m: any, i: number) =>
      i === row.ref.idx ? { ...m, nomePessoa: novo } : m);
    // feedback imediato no modal (a fonte é this.nodes)
    if (node.membros && node.membros[row.ref.idx]) {
      node.membros[row.ref.idx] = { ...node.membros[row.ref.idx], nomePessoa: novo };
    }
    this.emitirAtualizacaoMembros(node, membros);
  }

  /** HTML do breakdown de FTE por perfil para exportação. */
  renderFtePerfisHtml(node: any): string {
    if (!this.mostrarFteTotal(node)) return '';
    const gs = this.ftePorPerfilNode(node);
    if (!gs.length) return '';
    const itens = gs.map(g =>
      `<span class="fte-perfil"><em>${this.escapeHtml(g.label)}</em> ${this.escapeHtml(this.formatFte(g.fte))}</span>`
    ).join('');
    return `<div class="fte-perfis">${itens}</div>`;
  }

  /** Mostra o FTE Total? Para times com membros na própria estrutura ou nas descendentes. Nunca é ocultado. */
  mostrarFteTotal(node: any): boolean {
    if (!this.mostrarMarcacoesDeTime(node)) return false;
    const ids = this.subtree(node.id);
    // só squads contam para o FTE (a tribo agrega os squads abaixo)
    return this.nodes.some((n: any) => ids.has(n.id) && this.contaFtePropria(n) && (n.membros || []).length > 0);
  }
  /** Chip discreto de FTE Total para exportação (posicionado junto ao tipo). */
  renderFteChipHtml(node: any): string {
    if (!this.mostrarFteTotal(node)) return '';
    return `<span class="fte-chip" title="FTE Total">FTE ${this.escapeHtml(this.formatFte(this.fteTotalNode(node)))}</span>`;
  }

  /**
   * Na exportação PNG, o pai primário já é ligado pela linha CSS do organograma.
   * Para nós com múltiplos pais, removemos os chips de pais extras e desenhamos
   * uma linha (cotovelo) de cada pai adicional até o card — como na tela.
   * Usa divs posicionadas (renderizam bem no html2canvas).
   */
  injectExportMultiParentLines(host: any): void {
    if (!host) return;
    // remove os chips de pais extras — serão substituídos por linhas
    host.querySelectorAll('.multi-parent-export').forEach((el: any) => el.remove());
    const treeEl = host.querySelector('.tree');
    if (!treeEl) return;
    const cards: any[] = Array.from(treeEl.querySelectorAll('.card[data-node-id]'));
    const byId = new Map<string, any>(cards.map((el: any) => [el.getAttribute('data-node-id'), el]));
    const base = treeEl.getBoundingClientRect();
    const W = 2, COLOR = '#cbd5e1';
    const overlay = document.createElement('div');
    // Sem z-index: como é o primeiro filho de .tree, fica atrás dos cards (ordem do DOM).
    Object.assign(overlay.style, {
      position: 'absolute', left: '0', top: '0',
      width: treeEl.scrollWidth + 'px', height: treeEl.scrollHeight + 'px',
      pointerEvents: 'none',
    });
    const addSeg = (x: number, y: number, w: number, h: number) => {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute', left: Math.round(x) + 'px', top: Math.round(y) + 'px',
        width: Math.max(W, Math.round(w)) + 'px', height: Math.max(W, Math.round(h)) + 'px',
        background: COLOR,
      });
      overlay.appendChild(d);
    };
    let drew = false;
    for (const childEl of cards) {
      const id = childEl.getAttribute('data-node-id');
      const node = this.nodes.find((n: any) => n.id === id);
      if (!node) continue;
      const primary = this.paiPrincipalDeRender(node);
      const cr = childEl.getBoundingClientRect();
      const cx = cr.left + cr.width / 2 - base.left;
      const cyTop = cr.top - base.top;
      for (const pid of this.paisDe(node)) {
        if (pid === primary) continue;            // pai primário já tem a linha CSS
        const pEl = byId.get(pid);
        if (!pEl) continue;
        const pr = pEl.getBoundingClientRect();
        const px = pr.left + pr.width / 2 - base.left;
        const pyB = pr.bottom - base.top;
        const midY = (pyB + cyTop) / 2;
        addSeg(px - W / 2, Math.min(pyB, midY), W, Math.abs(midY - pyB));         // vertical no pai
        addSeg(Math.min(px, cx) - W / 2, midY - W / 2, Math.abs(cx - px) + W, W); // horizontal
        addSeg(cx - W / 2, Math.min(midY, cyTop), W, Math.abs(cyTop - midY));     // vertical no filho
        drew = true;
      }
    }
    if (drew) {
      treeEl.style.position = 'relative';
      treeEl.insertBefore(overlay, treeEl.firstChild);
    }
  }

  /** HTML dos projetos para a exportação (PNG/impressão). */
  renderProjetosHtml(node: any): string {
    if (this.ocultarProjetos || !this.mostrarProjetos(node)) return '';
    const ps = this.projetosVisiveisDoNode(node);
    if (!ps.length) return '';
    const itens = ps.map((p: any) => {
      const pct = this.projetoPct(p);
      const cor = this.corPercentual(pct);
      const shared = this.projetoCompartilhado(p.id)
        ? '<span class="proj-shared" title="Compartilhado com mais de um time">⇄</span>' : '';
      return `<div class="proj"><div class="proj-top"><span class="proj-nome">${this.escapeHtml(p.nome)}${shared}</span>`
        + `<span class="proj-pct" style="color:${cor}">${pct}%</span></div>`
        + `<div class="proj-bar"><span style="width:${pct}%;background:${cor}"></span></div></div>`;
    }).join('');
    return `<div class="projetos"><div class="projetos-head">Projetos</div>${itens}</div>`;
  }

toast=U(it);tbdNome="TBD - To be defined";nodes: any[] = []; pessoas: any[] = []; perfis: any[] = []; fotos: Record<string, string> = {}; percentuais: Record<string, number> = {}; linhasOrcamentarias: any[] = []; ajustes: any[] = []; alocacoes: any[] = []; projetos: any[] = []; create = new G<any>(); update = new G<any>(); remove = new G<string>(); moveMember = new G<any>();tipos=["PRESIDENCIA","VICE_PRESIDENCIA","SUPERINTENDENCIA","DIRETORIA","GERENCIA","TRIBO","SQUAD","CUSTOM"];tipoLabels={PRESIDENCIA:"Presid\xEAncia",VICE_PRESIDENCIA:"Vice-presid\xEAncia",SUPERINTENDENCIA:"Superintend\xEAncia",DIRETORIA:"Diretoria",GERENCIA:"Ger\xEAncia",TRIBO:"Tribo",SQUAD:"Squad",CUSTOM:"Personalizado"};formAberto=!1;editingId="";form={tipo:"PRESIDENCIA",tipoRotulo:"",nome:"",descricao:"",parentIds:[],loIds:[],projetoIds:[],projetosOcultos:[]};membros: any[] = [];membroSel={personId:"",papel:"",cross:!1,subgrupo:""};grupoDefs=[{key:"folha",titulo:"Folha",cls:"g-folha"},{key:"terceiro",titulo:"Terceiros",cls:"g-terceiro"}];tbdVinculo="FOLHA";gerarAberto=!1;gerarLoId="";gerarParentId="";exportRootId="";ocultarValoresExport=!1;ocultarProjetos=!1;hiddenNodeIds: Set<string> | null = null;dragOrigem: any = null;dragOverNodeId="";tipoLabel(t){return this.tipoLabels[this.tipoNormalizado(t)]||this.tipoLabels[t]||t}rotuloNode(t){if(this.tipoNormalizado(t?.tipo)==="CUSTOM"&&(t?.tipoRotulo||"").trim())return t.tipoRotulo.trim();return this.tipoLabel(t?.tipo)}tipoClasse(t){return this.tipoNormalizado(t)}tipoNormalizado(t){return t}tipoPermiteMarcacoesDeTime(t){let e=this.tipoNormalizado(t);return e==="TRIBO"||e==="SQUAD"||e==="CUSTOM"}contaFtePropria(t){let e=this.tipoNormalizado(t?.tipo);return e==="SQUAD"||e==="CUSTOM"}byOrdem(t,e){let n=t.ordem??0,o=e.ordem??0;return n!==o?n-o:String(t.nome||"").localeCompare(String(e.nome||""),"pt-BR")}paisDe(t){return t?((t.parentIds&&t.parentIds.length?t.parentIds:t.parentId?[t.parentId]:[])||[]).filter(n=>!!n):[]}parentVinculado(t){return this.form.parentIds.includes(t)}toggleParent(t){let e=this.form.parentIds.indexOf(t);e>=0?this.form.parentIds.splice(e,1):this.form.parentIds.push(t)}vinculoDestacado=null;alternarVinculo(t,e,n){n?.stopPropagation(),this.vinculoAtivo(t,e)?this.vinculoDestacado=null:this.vinculoDestacado={de:t,para:e}}vinculoAtivo(t,e){return!!this.vinculoDestacado&&this.vinculoDestacado.de===t&&this.vinculoDestacado.para===e}ehOrigemDestacada(t){return this.vinculoDestacado?.de===t}ehDestinoDestacado(t){return this.vinculoDestacado?.para===t}limparVinculoDestacado(){this.vinculoDestacado=null}nomePorId(t){let e=this.nodes.find(n=>n.id===t);return e?`${this.tipoLabel(e.tipo)} \xB7 ${e.nome}`:""}raizes(){let t=new Set(this.nodes.map(e=>e.id));return this.nodes.filter(e=>this.paisDe(e).filter(n=>t.has(n)).length===0).sort((e,n)=>this.byOrdem(e,n))}raizesVisiveis(){if(this.ensureHiddenLoaded(),this.exportRootId){let t=this.nodes.find(e=>e.id===this.exportRootId);if(t&&!this.estaEmCadeiaOculta(t))return[t]}return this.raizes().filter(t=>!this.isOculto(t.id))}filhosDe(t){return this.nodes.filter(e=>this.paisDe(e).includes(t)).sort((e,n)=>this.byOrdem(e,n))}filhosVisiveisDe(t){return this.ensureHiddenLoaded(),this.filhosDe(t).filter(e=>!this.isOculto(e.id))}paiPrincipalDeRender(t){let e=new Set(this.nodes.map(o=>o.id));return this.paisDe(t).filter(o=>e.has(o)&&!this.isOculto(o))[0]||null}filhosRenderVisiveisDe(t){return this.filhosVisiveisDe(t).filter(e=>this.paiPrincipalDeRender(e)===t)}ocultosDiretosRenderDe(t){return this.filhosDe(t).filter(e=>this.isOculto(e.id)&&this.paiPrincipalDeRender(e)===t)}temMultiplosPais(t){return this.paisDe(t).filter(e=>this.nodes.some(n=>n.id===e)).length>1}paisVisiveisDoNode(t){return this.paisDe(t).map(e=>this.nodes.find(n=>n.id===e)).filter(e=>!!e).sort((e,n)=>this.byOrdem(e,n))}paisLabel(t){let e=this.paisVisiveisDoNode(t);return e.length?`Ligado a: ${e.map(n=>n.nome).join(", ")}`:""}hiddenStorageKey(){let t=(localStorage.getItem("planner_user")||"").trim().toLowerCase();return t?`planner_hierarchy_hidden_${t}`:"planner_hierarchy_hidden"}ensureHiddenLoaded(){if(!this.hiddenNodeIds)try{let t=JSON.parse(localStorage.getItem(this.hiddenStorageKey())||"[]");this.hiddenNodeIds=new Set(Array.isArray(t)?t.map(String):[])}catch{this.hiddenNodeIds=new Set}}saveHiddenState(){this.ensureHiddenLoaded();let t=[...this.hiddenNodeIds||[]].filter(e=>this.nodes.some(n=>n.id===e));this.hiddenNodeIds=new Set(t),localStorage.setItem(this.hiddenStorageKey(),JSON.stringify(t))}isOculto(t){return this.ensureHiddenLoaded(),!!this.hiddenNodeIds?.has(t)}estaEmCadeiaOculta(t){this.ensureHiddenLoaded();let e=t,n=new Set;for(;e&&!n.has(e.id);){if(this.isOculto(e.id))return!0;n.add(e.id);let o=this.paisDe(e)[0];e=o?this.nodes.find(r=>r.id===o):void 0}return!1}ocultarCadeia(t,e){e?.stopPropagation(),this.ensureHiddenLoaded(),this.hiddenNodeIds?.add(t.id),this.exportRootId===t.id&&(this.exportRootId=""),this.saveHiddenState(),this.onHierarchyLayoutChange()}mostrarCadeia(t){this.ensureHiddenLoaded(),this.hiddenNodeIds?.delete(t),this.saveHiddenState(),this.onHierarchyLayoutChange()}limparOcultos(){this.ensureHiddenLoaded(),this.hiddenNodeIds?.clear(),this.saveHiddenState(),this.onHierarchyLayoutChange()}ocultosDiretosDe(t){return this.filhosDe(t).filter(e=>this.isOculto(e.id))}raizesOcultas(){return this.raizes().filter(t=>this.isOculto(t.id))}totalOcultos(){return this.ensureHiddenLoaded(),[...this.hiddenNodeIds||[]].filter(t=>this.nodes.some(e=>e.id===t)).length}countCadeia(t){return this.subtree(t.id).size}paisDisponiveis(){if(!this.editingId)return[...this.nodes].sort((e,n)=>this.byOrdem(e,n));let t=this.subtree(this.editingId);return this.nodes.filter(e=>!t.has(e.id)).sort((e,n)=>this.byOrdem(e,n))}subtree(t){let e=new Set([t]),n=!0;for(;n;){n=!1;for(let o of this.nodes)!e.has(o.id)&&this.paisDe(o).some(r=>e.has(r))&&(e.add(o.id),n=!0)}return e}totalPessoas(){let t=new Set;for(let e of this.nodes)for(let n of e.membros||[])this.membroContaNoTotal(n)&&t.add(this.norm(n.nomePessoa));return t.size}pessoaDebitaLo(t){let e=String(t?.perfilId||"").trim();if(e){let o=this.perfis.find(r=>String(r?.id||"").trim()===e);if(o)return o.debitaLo!==!1}let n=this.norm(this.perfilNomeDaPessoa(t));if(n){let o=this.perfis.find(r=>this.norm(r?.nomePerfil||r?.nome||"")===n);if(o)return o.debitaLo!==!1}return!0}membroContaNoTotal(t){let e=this.pessoaDoMembro(t);return e?this.pessoaDebitaLo(e):!0}norm(t){return String(t||"").trim().toLowerCase()}fotoDe(t){return this.fotos?.[this.norm(t)]||""}iniciais(t){let e=String(t||"").trim().split(/\s+/).filter(Boolean);return e.length?((e[0][0]||"")+(e.length>1&&e[e.length-1][0]||"")).toUpperCase():"?"}pessoaDoMembro(t){if(t?.personId){let e=this.pessoas.find(n=>n.id===t.personId);if(e)return e}return this.pessoas.find(e=>this.norm(e?.nome||"")===this.norm(t?.nomePessoa||""))||null}mostrarMarcacoesDeTime(t){return this.tipoPermiteMarcacoesDeTime(t.tipo)}mostrarPercentual(t){return this.mostrarMarcacoesDeTime(t)&&!this.ocultarValoresExport}percentualPessoa(t){if(t?.percentual!=null)return Math.round(t.percentual*100)/100;let e=this.percentuais?.[this.norm(t.nomePessoa)];return e==null?null:Math.round(e*100)/100}corPercentual(t){let e=Math.max(0,Math.min(100,t??0))/100,n=[249,115,22],o=[37,99,235],r=n.map((c,p)=>Math.round(c+(o[p]-c)*e));return`rgb(${r[0]}, ${r[1]}, ${r[2]})`}pctEditKey=null;pctEditValue=null;pctKey(t,e){return`${t.id}|${e}`}editandoPct(t,e){return this.pctEditKey===this.pctKey(t,e)}iniciarEdicaoPct(t,e,n,o){if(!this.mostrarPercentual(t))return;o.stopPropagation(),o.preventDefault(),this.pctEditKey=this.pctKey(t,e);let r=this.percentualPessoa(n);this.pctEditValue=r??100}salvarPct(t,e){if(!this.mostrarPercentual(t)){this.cancelarEdicaoPct();return}if(this.pctEditKey!==this.pctKey(t,e))return;let n=Number(this.pctEditValue),o=Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n*100)/100)):null,r=(t.membros||[]).map((c,p)=>p===e?Y($({},c),{percentual:o}):c);this.pctEditKey=null,this.pctEditValue=null,this.emitirAtualizacaoMembros(t,r)}cancelarEdicaoPct(){this.pctEditKey=null,this.pctEditValue=null}ehTerceiro(t){let e=this.pessoaDoMembro(t);return e?String(e.tipoVinculo||"").toUpperCase()==="TERCEIRO":String(t?.vinculo||"").toUpperCase()==="TERCEIRO"}vinculoLabel(t){return this.ehTerceiro(t)?"Terceiro":"Folha"}papelDoMembro(t){if(t?.papel&&t.papel.trim())return this.primeiraPartePerfil(t.papel);let e=this.pessoaDoMembro(t);return this.primeiraPartePerfil(this.perfilNomeDaPessoa(e))}primeiraPartePerfil(t){return String(t||"").split("|")[0].trim()}perfilNomeDaPessoa(t){if(!t)return"";let e=String(t?.perfilNome||t?.perfil||"").trim();if(e)return e;let n=String(t?.perfilId||"").trim();if(!n)return"";let o=this.perfis.find(r=>String(r?.id||"").trim()===n);return String(o?.nomePerfil||o?.nome||"").trim()}areaDoMembro(t){let e=this.pessoaDoMembro(t);if(!e)return"";let n=this.perfilNomeDaPessoa(e);return this.ehTerceiro(t)?e.consultoria||this.primeiraPartePerfil(n)||"":this.primeiraPartePerfil(n)}metaDoMembro(t){let e=this.papelDoMembro(t),n=this.areaDoMembro(t);return e&&n&&this.norm(this.primeiraPartePerfil(e))===this.norm(this.primeiraPartePerfil(n))?e:[e,n].filter(Boolean).join(" \xB7 ")}ehCross(t){return!!t?.cross}membrosPorGrupo(t,e,n=null){return(t.membros||[]).map((o,r)=>({m:o,idx:r})).filter(o=>n!=null&&(o.m.subgrupo||"").trim()!==n?!1:this.ehTerceiro(o.m)===(e==="terceiro")).sort((o,r)=>this.rankPapel(t,o.m)-this.rankPapel(t,r.m)||o.idx-r.idx)}subgruposDoNode(t){let e=new Set,n=[];for(let o of t.membros||[]){let r=(o.subgrupo||"").trim();!r||e.has(r)||(e.add(r),n.push({key:r,label:r}))}return n}subgruposParaRender(t){let e=this.subgruposDoNode(t);if(!e.length)return[{key:"__flat__",label:"",filter:null}];let n=[];(t.membros||[]).some(o=>!(o.subgrupo||"").trim())&&n.push({key:"__flat__",label:"",filter:""});for(let o of e)n.push({key:o.key,label:o.label,filter:o.key});return n}subgruposSugeridos(){let t=new Set;for(let e of this.nodes)for(let n of e.membros||[]){let o=(n.subgrupo||"").trim();o&&t.add(o)}return Array.from(t).sort((e,n)=>e.localeCompare(n,"pt-BR"))}rankPapel(t,e){let n=this.norm(this.papelDoMembro(e)),o=this.tipoNormalizado(t.tipo);return o==="SUPERINTENDENCIA"?n==="superintendente"?0:n.includes("gerente")?1:2:o==="TRIBO"?n==="lpt"?0:n==="ltt"||n==="lnp"?1:2:o==="SQUAD"?n==="it lead"||n==="pm"?0:1:0}membrosPorVinculo(t,e){return this.membrosPorGrupo(t,e?"terceiro":"folha")}membroContaFte(t){let e=this.pessoaDoMembro(t);return!(e&&e.contaFte===!1)}fteMembro(t){return this.membroContaFte(t)?(this.percentualPessoa(t)??100)/100:0}fteGrupo(t,e,n=null){return this.mostrarMarcacoesDeTime(t)?this.membrosPorGrupo(t,e,n).reduce((o,r)=>o+this.fteMembro(r.m),0):0}formatFte(t){let e=Math.round(t*100)/100;return Number.isInteger(e)?String(e):e.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:2})}percentualGrupoSquad(t,e,n=null){if(!this.contaFtePropria(t)||e!=="folha"&&e!=="terceiro")return"";let o=this.fteGrupo(t,"folha",n),r=this.fteGrupo(t,"terceiro",n),c=o+r;return c?`${Math.round((e==="folha"?o:r)/c*100)}%`:""}resumoGrupoSquad(t,e,n=null){if(!this.mostrarMarcacoesDeTime(t)){let c=this.membrosPorGrupo(t,e,n).length;return c?String(c):""}if(!this.membrosPorGrupo(t,e,n).length)return"";let o=this.formatFte(this.fteGrupo(t,e,n)),r=this.percentualGrupoSquad(t,e,n);return r?`${o} \xB7 ${r}`:o}abrirNovo(t=""){this.formAberto=!0,this.editingId="",this.form={tipo:t?this.tipoSugerido(t):"PRESIDENCIA",tipoRotulo:"",nome:"",descricao:"",parentIds:t?[t]:[],loIds:[],projetoIds:[],projetosOcultos:[]},this.membros=[],this.membroSel={personId:"",papel:"",cross:!1,subgrupo:""}}tipoSugerido(t){let e=this.nodes.find(o=>o.id===t),n=e?this.tipos.indexOf(this.tipoNormalizado(e.tipo)):-1,r=n>=0&&n<this.tipos.length-1?this.tipos[n+1]:"SQUAD";return r==="CUSTOM"?"SQUAD":r}editar(t){this.formAberto=!0,this.editingId=t.id,this.form={tipo:this.tipoNormalizado(t.tipo),tipoRotulo:t.tipoRotulo||"",nome:t.nome,descricao:t.descricao||"",parentIds:[...this.paisDe(t)],loIds:[...t.loIds||[]],projetoIds:[...t.projetoIds||[]],projetosOcultos:[...t.projetosOcultos||[]]},this.membros=(t.membros||[]).map(e=>({personId:e.personId??null,nomePessoa:e.nomePessoa,papel:e.papel||"",cross:!!e.cross,vinculo:e.vinculo??null,percentual:e.percentual??null,subgrupo:e.subgrupo??null})),this.membroSel={personId:"",papel:"",cross:!1,subgrupo:""}}cancelar(){this.formAberto=!1,this.editingId="",this.membros=[]}get nomeValido(){return(this.form.nome||"").trim().length>0}get formValido(){return this.nomeValido}adicionarMembro(){if(!this.membroSel.personId){this.toast.show("Selecione uma pessoa para adicionar \xE0 estrutura.","error");return}let t=this.pessoas.find(n=>n.id===this.membroSel.personId);if(!t){this.toast.show("Pessoa selecionada n\xE3o foi encontrada. Atualize a lista e tente novamente.","error");return}if(this.membros.some(n=>this.norm(n.nomePessoa)===this.norm(t.nome))){this.membroSel={personId:"",papel:"",cross:!1,subgrupo:this.membroSel.subgrupo},this.toast.show("Essa pessoa j\xE1 est\xE1 vinculada nesta estrutura.","error");return}let e=this.membroSel.subgrupo.trim();this.membros=[...this.membros,{personId:t.id,nomePessoa:t.nome,papel:this.membroSel.papel.trim(),cross:this.membroSel.cross,subgrupo:e||null}],this.membroSel={personId:"",papel:"",cross:!1,subgrupo:this.membroSel.subgrupo}}adicionarMembroTbd(){let t=this.membroSel.papel.trim();if(!t){this.toast.show("Informe o cargo da pessoa TBD antes de adicionar.","error");return}if(this.norm(t)==="to be defined"||this.norm(t)===this.norm(this.tbdNome)){this.toast.show('O subt\xEDtulo do TBD deve ser o cargo da vaga, n\xE3o "To be defined".',"error");return}let e=this.membroSel.subgrupo.trim();this.membros=[...this.membros,{personId:null,nomePessoa:this.tbdNome,papel:t,cross:this.membroSel.cross,vinculo:this.tbdVinculo,subgrupo:e||null}],this.membroSel={personId:"",papel:"",cross:!1,subgrupo:this.membroSel.subgrupo},this.tbdVinculo="FOLHA"}removerMembro(t){this.membros=this.membros.filter((e,n)=>n!==t)}podeSalvar(){return!!this.form.nome.trim()&&this.tipos.includes(this.form.tipo)}validarCadastro(){let t=this.form.nome.trim();if(!this.tipos.includes(this.form.tipo))return"Selecione um tipo v\xE1lido para a estrutura.";if(this.form.tipo==="CUSTOM"&&!(this.form.tipoRotulo||"").trim())return"Informe o nome do tipo da estrutura personalizada.";if(!t)return"Informe o nome da estrutura.";if(t.length<2)return"O nome da estrutura precisa ter pelo menos 2 caracteres.";for(let c of this.form.parentIds)if(!this.nodes.some(p=>p.id===c))return"Uma das estruturas superiores selecionadas n\xE3o existe mais.";let e=this.form.parentIds,n=this.norm(t);if(this.nodes.some(c=>{if(c.id===this.editingId||this.norm(c.nome)!==n)return!1;let p=this.paisDe(c);return e.length===0&&p.length===0?!0:p.some(m=>e.includes(m))}))return"J\xE1 existe uma estrutura com esse nome no mesmo n\xEDvel.";let r=new Set;for(let c of this.membros){let p=String(c?.nomePessoa||"").trim();if(!p)return"Remova ou corrija membros sem nome antes de salvar.";if(this.norm(p)===this.norm(this.tbdNome)){let h=String(c?.papel||"").trim();if(!h)return"Todo TBD precisa ter um cargo informado.";if(this.norm(h)==="to be defined"||this.norm(h)===this.norm(this.tbdNome))return'O subt\xEDtulo do TBD deve ser o cargo da vaga, n\xE3o "To be defined".';continue}let m=this.norm(p);if(r.has(m))return`A pessoa "${p}" foi adicionada mais de uma vez.`;r.add(m)}return""}salvar(){let t=this.validarCadastro();if(t){this.toast.show(t,"error");return}let e=this.tipoNormalizado(this.form.tipo),n={tipo:e,tipoRotulo:e==="CUSTOM"?(this.form.tipoRotulo||"").trim():null,nome:this.form.nome.trim(),descricao:this.form.descricao.trim(),parentIds:[...this.form.parentIds],parentId:this.form.parentIds[0]||null,membros:this.membros.map(o=>({personId:o.personId,nomePessoa:o.nomePessoa,papel:o.papel,cross:!!o.cross,vinculo:o.vinculo??null,percentual:this.tipoPermiteMarcacoesDeTime(e)?o.percentual??null:null,subgrupo:o.subgrupo??null})),loIds:[...this.form.loIds],projetoIds:[...this.form.projetoIds||[]],projetosOcultos:[...this.form.projetosOcultos||[]]};this.editingId?this.update.emit($({id:this.editingId},n)):this.create.emit(n),this.cancelar()}excluir(t){this.remove.emit(t.id),this.editingId===t.id&&this.cancelar()}losDisponiveis(){return[...this.linhasOrcamentarias].sort((t,e)=>{let n=Number(e?.ano||0)-Number(t?.ano||0);return n!==0?n:String(t?.codigo||t?.nome||"").localeCompare(String(e?.codigo||e?.nome||""),"pt-BR")})}loVinculada(t){return this.form.loIds.includes(t)}toggleLo(t){this.form.loIds=this.loVinculada(t)?this.form.loIds.filter(e=>e!==t):[...this.form.loIds,t]}somaLosForm(){return this.round2(this.form.loIds.reduce((t,e)=>t+this.valorLoPorId(e),0))}loLabel(t){let e=this.linhasOrcamentarias.find(n=>n.id===t);return e&&(e.codigo||e.nome)||t}losDoNode(t){return t.loIds||[]}round2(t){return Math.round((Number(t)||0)*100)/100}valorLoPorId(t){let e=this.linhasOrcamentarias.find(r=>r.id===t);if(!e)return 0;let n=Number(e.valorTotal||0),o=(this.ajustes||[]).filter(r=>r.budgetLineId===t).reduce((r,c)=>r+(String(c?.tipo||"").toUpperCase()==="APORTE"?Number(c?.valor||0):-Number(c?.valor||0)),0);return this.round2(n+o)}loIdsSubtree(t){let e=new Set,n=o=>{(o.loIds||[]).forEach(r=>e.add(r)),this.filhosVisiveisDe(o.id).forEach(n)};return n(t),e}valorAgregado(t){let e=0;for(let n of this.loIdsSubtree(t))e+=this.valorLoPorId(n);return this.round2(e)}temValorAgregado(t){return this.loIdsSubtree(t).size>0}currency(t){return(Number(t)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}formatCompact(t){let e=Number(t)||0,n=Math.abs(e);return n>=1e6?"R$ "+(e/1e6).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:1})+" MM":n>=1e3?"R$ "+(e/1e3).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:1})+" k":"R$ "+e.toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0})}membroForaDaLo(t,e){if(!this.mostrarMarcacoesDeTime(t)||!e.personId&&this.norm(e.nomePessoa)===this.norm(this.tbdNome))return!1;let n=t.loIds||[];if(!n.length)return!1;let o=this.norm(e.nomePessoa);return!this.alocacoes.some(r=>n.includes(r.linhaOrcamentariaId)&&this.norm(r.nomePessoa)===o)}nodeQtdAlertas(t){return this.mostrarMarcacoesDeTime(t)?(t.membros||[]).filter(e=>this.membroForaDaLo(t,e)).length:0}abrirGerar(){this.gerarAberto=!0,this.gerarLoId="",this.gerarParentId=""}cancelarGerar(){this.gerarAberto=!1}pessoasDaLo(t){let e=new Set,n=[];for(let o of this.alocacoes){if(o.linhaOrcamentariaId!==t||o.draft)continue;let r=String(o.nomePessoa||"").trim();if(!r)continue;let c=this.norm(r);if(e.has(c))continue;e.add(c);let p=this.pessoas.find(m=>this.norm(m.nome)===c);n.push({personId:p?.id??null,nomePessoa:r,papel:o.perfilNome||"",cross:!1})}return n}qtdPessoasDaLo(t){return t?this.pessoasDaLo(t).length:0}gerarSquadDaLo(){let t=this.linhasOrcamentarias.find(n=>n.id===this.gerarLoId);if(!t)return;let e=this.pessoasDaLo(t.id);this.create.emit({tipo:"SQUAD",nome:t.nome||t.codigo||"Squad",descricao:"",parentId:this.gerarParentId||null,membros:e.map(n=>({personId:n.personId,nomePessoa:n.nomePessoa,papel:n.papel})),loIds:[t.id]}),this.gerarAberto=!1,this.gerarLoId="",this.gerarParentId=""}onMembroDragStart(t,e,n){this.dragOrigem={nodeId:t.id,index:e},n.dataTransfer&&(n.dataTransfer.effectAllowed="move")}onMembroDragEnd(){this.dragOrigem=null,this.dragOverNodeId=""}onNodeDragOver(t,e){this.dragOrigem&&(e.preventDefault(),e.dataTransfer&&(e.dataTransfer.dropEffect="move"),this.dragOverNodeId=t.id)}onNodeDragLeave(t){this.dragOverNodeId===t.id&&(this.dragOverNodeId="")}onNodeDrop(t,e){e.preventDefault(),this.dragOverNodeId="";let n=this.dragOrigem;if(this.dragOrigem=null,!n||n.nodeId===t.id)return;let o=this.nodes.find(c=>c.id===n.nodeId);if(!o)return;let r=(o.membros||[])[n.index];r&&this.moveMember.emit({fromNodeId:o.id,toNodeId:t.id,nomePessoa:r.nomePessoa})}removerMembroDoNode(t,e,n){n.stopPropagation();let o=(t.membros||[]).filter((r,c)=>c!==e);this.emitirAtualizacaoMembros(t,o)}emitirAtualizacaoMembros(t,e){let n=this.tipoNormalizado(t.tipo);this.update.emit({id:t.id,tipo:n,tipoRotulo:t.tipoRotulo||null,nome:t.nome,descricao:t.descricao||"",parentId:t.parentId||null,ordem:t.ordem,membros:e.map(o=>({personId:o.personId??null,nomePessoa:o.nomePessoa,papel:o.papel||"",cross:!!o.cross,vinculo:o.vinculo??null,percentual:this.tipoPermiteMarcacoesDeTime(n)?o.percentual??null:null,subgrupo:o.subgrupo??null})),loIds:[...t.loIds||[]],projetoIds:[...t.projetoIds||[]],projetosOcultos:[...t.projetosOcultos||[]]})}nodesParaExportar(){return this.ensureHiddenLoaded(),this.nodes.filter(t=>!this.estaEmCadeiaOculta(t)).sort((t,e)=>{let n=this.tipos.indexOf(this.tipoNormalizado(t.tipo))-this.tipos.indexOf(this.tipoNormalizado(e.tipo));return n!==0?n:this.byOrdem(t,e)})}async exportar(){let t=this.exportRootId?this.nodes.find(m=>m.id===this.exportRootId):null,e=t&&!this.estaEmCadeiaOculta(t)?[t]:this.raizesVisiveis();if(!e.length)return;let n=t?t.nome:"Hierarquia Organizacional",o=e.map(m=>this.renderNodeHtml(m)).join(""),r=new Date().toLocaleDateString("pt-BR"),c=document.createElement("div");c.innerHTML=`
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
  .node { display: flex; flex-direction: column; align-items: center; position: relative; }
  .card { border-radius: 18px; border: 1px solid #e2e8f0; padding: 16px 18px; min-width: 240px; max-width: 380px;
          box-shadow: 0 10px 28px rgba(15,23,42,.10); text-align: center; background: #fff; }
  .tipo { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 900; margin-bottom: 6px; }
  .nome { font-size: 17px; font-weight: 900; line-height: 1.22; }
  .desc { font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.35; }
  .t-PRESIDENCIA .tipo { color: #7c3aed; } .t-PRESIDENCIA > .card { border-top: 6px solid #7c3aed; }
  .t-VICE_PRESIDENCIA .tipo { color: #4f46e5; } .t-VICE_PRESIDENCIA > .card { border-top: 6px solid #4f46e5; }
  .t-SUPERINTENDENCIA .tipo { color: #2563eb; } .t-SUPERINTENDENCIA > .card { border-top: 6px solid #2563eb; }
  .t-GERENCIA .tipo { color: #0891b2; } .t-GERENCIA > .card { border-top: 6px solid #0891b2; }
  .t-DIRETORIA .tipo { color: #2563eb; } .t-DIRETORIA > .card { border-top: 6px solid #2563eb; }
  .t-TRIBO .tipo { color: #0891b2; } .t-TRIBO > .card { border-top: 6px solid #0891b2; }
  .t-SQUAD .tipo { color: #059669; } .t-SQUAD > .card { border-top: 6px solid #059669; }
  .t-CUSTOM .tipo { color: #db2777; } .t-CUSTOM > .card { border-top: 6px solid #db2777; }
  .membros { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .subgrupo { margin-top: 8px; }
  .subgrupo:not(.flat) { border: 1px dashed #d7e3f5; border-radius: 12px; padding: 8px; background: rgba(248,250,252,.82); }
  .subgrupo-head { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: 6px; text-align: left; }
  .grupo { border-radius: 12px; padding: 8px 10px; text-align: left; }
  .grupo.g-cross { background: #fff7ed; border: 1px solid #fed7aa; }
  .grupo.g-folha { background: #eff6ff; }
  .grupo.g-terceiro { background: #ecfeff; }
  .grupo-head { display: flex; justify-content: flex-end; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
  .g-cross .grupo-head { color: #c2410c; }
  .g-folha .grupo-head { color: #1d4ed8; }
  .g-terceiro .grupo-head { color: #0e7490; }
  .grupo-count { background: rgba(15,23,42,.08); color: #334155; border-radius: 10px; padding: 0 6px; font-size: 9px; }
  .grupo-lista { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; }
  .m { display: flex; align-items: center; gap: 7px; font-size: 12px; text-align: left; margin-top: 5px; min-width: 0; }
  .m-info { min-width: 0; } .m-nome, .meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m-info { display: flex; flex-direction: column; line-height: 1.2; }
  .m-nome { font-weight: 700; color: #1e293b; }
  .meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; color: #64748b; font-size: 10px; }
  .cross { align-self: flex-start; color: #c2410c; background: #ffedd5; border-radius: 6px; padding: 0 5px; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; line-height: 1.5; }
  .pct { color: #3730a3; background: #e0e7ff; border-radius: 8px; padding: 1px 5px; font-size: 9px; font-weight: 900; line-height: 1; }
  .pct.vazio { color: #94a3b8; background: #f1f5f9; }
  .nofte, .alerta { margin-left: auto; font-size: 12px; line-height: 1; }
  .nofte { color: #64748b; }
  .alerta { color: #ea580c; }
  .m.fora-lo { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 3px 5px; }
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
  .multi-parent-export { display: flex; justify-content: center; gap: 6px; margin: 0 0 5px; }
  .multi-parent-export span { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; font-weight: 900; color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 999px; padding: 2px 8px; }
  .node.multi-parent > .card { box-shadow: 0 0 0 2px rgba(37,99,235,.16), 0 10px 28px rgba(15,23,42,.10); }
  /* Conectores em organograma desenhados com background (renderizam no html2canvas). */
  .children { display: flex; gap: 0; margin-top: 24px; padding-top: 26px; position: relative; flex-wrap: nowrap; justify-content: center; }
  .children::before { content: ''; position: absolute; top: -24px; left: 50%; margin-left: -1px; width: 2px; height: 37px; background: #cbd5e1; }
  .children > .node { position: relative; padding: 0 16px; }
  .children > .node::before { content: ''; position: absolute; top: -13px; left: 50%; margin-left: -1px; width: 2px; height: 13px; background: #cbd5e1; }
  .children > .node::after { content: ''; position: absolute; top: -13px; left: 0; width: 100%; height: 2px; background: #cbd5e1; }
  .children > .node:first-child::after { left: 50%; width: 50%; }
  .children > .node:last-child::after { left: 0; width: 50%; }
  .children > .node:only-child::after { display: none; }
  .tipo-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .tipo-row .tipo { margin-bottom: 0; }
  .fte-chip { flex: 0 0 auto; font-size: 11px; font-weight: 800; color: #1d4ed8; background: #eef6ff; border: 1px solid #cfe0fb; border-radius: 999px; padding: 1px 9px; white-space: nowrap; }
  .fte-perfis { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px; }
  .fte-perfil { font-size: 10px; font-weight: 700; color: #334155; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 2px 7px; white-space: nowrap; }
  .fte-perfil em { font-style: normal; font-weight: 900; color: #1d4ed8; margin-right: 3px; }
  .projetos { margin-top: 10px; text-align: left; border-top: 1px dashed #e2e8f0; padding-top: 8px; display: flex; flex-direction: column; gap: 7px; }
  .projetos-head { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #475569; }
  .proj { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 7px 9px; }
  .proj-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .proj-nome { font-size: 12px; font-weight: 800; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .proj-pct { font-size: 11px; font-weight: 900; }
  .proj-shared { margin-left: 5px; color: #7c3aed; font-weight: 900; font-size: 11px; }
  .proj-bar { margin-top: 5px; height: 6px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
  .proj-bar > span { display: block; height: 100%; border-radius: 999px; }
  .footer { margin-top: 42px; display: flex; justify-content: center; color: #64748b; font-size: 13px; }
</style>
<section class="hierarchy-export">
  <div class="sheet">
    <header class="hero">
      <div>
        <div class="eyebrow">Organograma</div>
        <h1>${this.escapeHtml(n)}</h1>
        <div class="sub">${t?this.escapeHtml(this.rotuloNode(t))+" \xB7 ":""}Exportado em ${r}</div>
      </div>
      <div class="metrics">
        <div class="metric"><span>Estruturas</span><strong>${this.countSubtreeNodes(e)}</strong></div>
        <div class="metric"><span>Pessoas</span><strong>${this.countSubtreePessoas(e)}</strong></div>
        <div class="metric"><span>Ra\xEDzes</span><strong>${e.length}</strong></div>
      </div>
    </header>
    <div class="tree-viewport"><div class="tree">${o}</div></div>
  </div>
</section>`;let p=document.createElement("div");Object.assign(p.style,{position:"fixed",top:"-100000px",left:"-100000px",zIndex:"-1",pointerEvents:"none"}),p.appendChild(c),document.body.appendChild(p);try{let{default:m}=await import('html2canvas');await this.waitForExportImages(c);let h=c.querySelector(".hierarchy-export");if(!h)return;this.injectExportMultiParentLines(h);let b=await m(h,{scale:Math.max(3,window.devicePixelRatio||1),useCORS:!0,allowTaint:!1,backgroundColor:null,logging:!1,width:h.scrollWidth,height:h.scrollHeight,windowWidth:h.scrollWidth,windowHeight:h.scrollHeight}),w=document.createElement("a");w.download=`hierarquia_${this.safeFilePart(n)}_${new Date().toISOString().slice(0,10)}.png`,w.href=b.toDataURL("image/png"),w.click()}finally{document.body.removeChild(p)}}waitForExportImages(t){let e=Array.from(t.querySelectorAll("img"));return e.length?Promise.all(e.map(n=>n.complete?Promise.resolve():new Promise(o=>{n.onload=()=>o(),n.onerror=()=>o()}))).then(()=>{}):Promise.resolve()}countSubtreeNodes(t){let e=new Set,n=o=>{e.has(o.id)||(e.add(o.id),this.filhosRenderVisiveisDe(o.id).forEach(n))};return t.forEach(n),e.size}countSubtreePessoas(t){let e=new Set,n=new Set,o=r=>{n.has(r.id)||(n.add(r.id),(r.membros||[]).forEach(c=>e.add(this.norm(c.nomePessoa))),this.filhosRenderVisiveisDe(r.id).forEach(o))};return t.forEach(o),e.size}safeFilePart(t){return String(t||"hierarquia").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,48)||"hierarquia"}exportarImpressao(){let t=this.raizesVisiveis();if(!t.length)return;let e=t.map(c=>this.renderNodeHtml(c)).join(""),o=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Hierarquia Organizacional</title>
<style>
  * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
  body { margin: 0; padding: 32px; background: #fff; color: #0f172a; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 28px; }
  .tree { display: flex; gap: 36px; align-items: flex-start; flex-wrap: nowrap; overflow-x: auto; }
  .node { display: flex; flex-direction: column; align-items: center; flex: 0 0 auto; }
  .card { border-radius: 12px; border: 1px solid #e2e8f0; padding: 12px 16px; min-width: 210px; max-width: none; width: max-content;
          box-shadow: 0 2px 8px rgba(15,23,42,.06); text-align: center; background: #fff; }
  .tipo { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
  .nome { font-size: 14px; font-weight: 700; }
  .desc { font-size: 11px; color: #64748b; margin-top: 2px; }
  .valor { font-size: 11px; color: #475569; margin-top: 4px; } .valor strong { color: #0f766e; }
  .t-PRESIDENCIA .tipo { color: #7c3aed; } .t-PRESIDENCIA .card { border-top: 4px solid #7c3aed; }
  .t-VICE_PRESIDENCIA .tipo { color: #4f46e5; } .t-VICE_PRESIDENCIA .card { border-top: 4px solid #4f46e5; }
  .t-SUPERINTENDENCIA .tipo { color: #2563eb; } .t-SUPERINTENDENCIA .card { border-top: 4px solid #2563eb; }
  .t-GERENCIA .tipo { color: #0891b2; } .t-GERENCIA .card { border-top: 4px solid #0891b2; }
  .t-DIRETORIA .tipo { color: #2563eb; } .t-DIRETORIA .card { border-top: 4px solid #2563eb; }
  .t-TRIBO .tipo { color: #0891b2; } .t-TRIBO .card { border-top: 4px solid #0891b2; }
  .t-SQUAD .tipo { color: #059669; } .t-SQUAD .card { border-top: 4px solid #059669; }
  .t-CUSTOM .tipo { color: #db2777; } .t-CUSTOM .card { border-top: 4px solid #db2777; }
  .membros { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .subgrupo { margin-top: 6px; }
  .subgrupo:not(.flat) { border: 1px dashed #d7e3f5; border-radius: 8px; padding: 6px; background: rgba(248,250,252,.82); }
  .subgrupo-head { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #475569; margin-bottom: 4px; text-align: left; }
  .grupo { border-radius: 8px; padding: 5px 7px; text-align: left; }
  .grupo.g-cross { background: #fff7ed; border: 1px solid #fed7aa; } .grupo.g-folha { background: #eff6ff; } .grupo.g-terceiro { background: #ecfeff; }
  .grupo-head { display: flex; justify-content: flex-end; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
  .g-cross .grupo-head { color: #c2410c; } .g-folha .grupo-head { color: #1d4ed8; } .g-terceiro .grupo-head { color: #0e7490; }
  .grupo-count { background: rgba(15,23,42,.08); color: #334155; border-radius: 10px; padding: 0 5px; font-size: 8px; }
  .grupo-lista { display: grid; grid-template-columns: repeat(2, minmax(140px, 1fr)); gap: 3px 10px; }
  .m { display: flex; align-items: center; gap: 6px; font-size: 11px; text-align: left; margin-top: 3px; min-width: 0; }
  .m-info { min-width: 0; } .m-nome, .meta { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
  .m-info { display: flex; flex-direction: column; line-height: 1.2; }
  .m-nome { font-weight: 700; color: #1e293b; }
  .meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; color: #64748b; font-size: 9px; }
  .cross { align-self: flex-start; color: #c2410c; background: #ffedd5; border-radius: 5px; padding: 0 4px; font-size: 7px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; line-height: 1.4; }
  .pct { color: #3730a3; background: #e0e7ff; border-radius: 7px; padding: 1px 4px; font-size: 8px; font-weight: 800; line-height: 1; }
  .pct.vazio { color: #94a3b8; background: #f1f5f9; }
  .nofte, .alerta { margin-left: auto; font-size: 10px; line-height: 1; }
  .nofte { color: #64748b; }
  .alerta { color: #ea580c; }
  .m.fora-lo { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 5px; padding: 2px 4px; }
  .av { width: 22px; height: 22px; border-radius: 50%; overflow: hidden; flex: 0 0 22px;
        display: inline-flex; align-items: center; justify-content: center; background: #eef2ff; color: #4338ca; font-size: 9px; font-weight: 700; }
  .av img { width: 100%; height: 100%; object-fit: cover; }
  .equipe { text-align: left; margin-top: 6px; }
  .equipe-head { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #475569; margin-bottom: 4px; }
  .equipe-avatars { display: flex; flex-wrap: wrap; }
  .eq-av { width: 24px; height: 24px; flex: 0 0 24px; margin-right: -6px; margin-bottom: 4px; border: 2px solid #fff; }
  .eq-more { background: #e2e8f0; color: #475569; }
  .children { display: flex; gap: 0; margin-top: 18px; padding-top: 18px; position: relative; flex-wrap: nowrap; justify-content: center; }
  .children::before { content: ''; position: absolute; top: -18px; left: 50%; margin-left: -1px; width: 2px; height: 27px; background: #cbd5e1; }
  .children > .node { position: relative; padding: 0 12px; }
  .children > .node::before { content: ''; position: absolute; top: -9px; left: 50%; margin-left: -1px; width: 2px; height: 9px; background: #cbd5e1; }
  .children > .node::after { content: ''; position: absolute; top: -9px; left: 0; width: 100%; height: 2px; background: #cbd5e1; }
  .children > .node:first-child::after { left: 50%; width: 50%; }
  .children > .node:last-child::after { left: 0; width: 50%; }
  .children > .node:only-child::after { display: none; }
  .tipo-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
  .tipo-row .tipo { margin-bottom: 0; }
  .fte-chip { flex: 0 0 auto; font-size: 9px; font-weight: 800; color: #1d4ed8; background: #eef6ff; border: 1px solid #cfe0fb; border-radius: 999px; padding: 0 7px; white-space: nowrap; }
  .fte-perfis { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
  .fte-perfil { font-size: 9px; font-weight: 700; color: #334155; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 7px; padding: 1px 6px; white-space: nowrap; }
  .fte-perfil em { font-style: normal; font-weight: 900; color: #1d4ed8; margin-right: 3px; }
  .projetos { margin-top: 8px; text-align: left; border-top: 1px dashed #e2e8f0; padding-top: 6px; display: flex; flex-direction: column; gap: 5px; }
  .projetos-head { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #475569; }
  .proj { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 5px 7px; }
  .proj-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .proj-nome { font-size: 11px; font-weight: 700; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .proj-pct { font-size: 10px; font-weight: 800; }
  .proj-shared { margin-left: 4px; color: #7c3aed; font-weight: 800; font-size: 10px; }
  .proj-bar { margin-top: 4px; height: 5px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
  .proj-bar > span { display: block; height: 100%; border-radius: 999px; }
  @media print { body { padding: 12px; } .tree { gap: 20px; } }
</style></head><body>
  <h1>Hierarquia Organizacional</h1>
  <div class="sub">Exportado em ${new Date().toLocaleDateString("pt-BR")}</div>
  <div class="tree">${e}</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
</body></html>`,r=window.open("","_blank");r&&(r.document.open(),r.document.write(o),r.document.close())}escapeHtml(t){return String(t||"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]||e)}renderMembroHtml(t,e){let n=this.fotoDe(e.nomePessoa),o=n?`<span class="av"><img src="${n}" alt="" /></span>`:`<span class="av">${this.escapeHtml(this.iniciais(e.nomePessoa))}</span>`,r=this.metaDoMembro(e),c=r?`<span>${this.escapeHtml(r)}</span>`:"",p=this.percentualPessoa(e),m=this.mostrarPercentual(t)&&p!==0?`<span class="pct${p==null?" vazio":""}"${p!=null?` style="background:${this.escapeHtml(this.corPercentual(p))};color:#fff"`:""}>${p!=null?`${this.formatPct(p)}%`:"\u2014"}</span>`:"",h=c||m?`<span class="meta">${c}${m}</span>`:"",b=this.ehCross(e)?'<span class="cross">Cross</span>':"",w=this.mostrarMarcacoesDeTime(t)&&!this.membroContaFte(e)?'<span class="nofte">\u2205</span>':"";return`<div class="m">${o}<div class="m-info">${b}<span class="m-nome">${this.escapeHtml(e.nomePessoa)}</span>${h}</div>${w}</div>`}renderGrupoHtml(t,e,n,o){let r=this.membrosPorGrupo(t,e,o);if(!r.length)return"";let c=r.map(p=>this.renderMembroHtml(t,p.m)).join("");let head=this.ocultarValoresExport||!this.contaFtePropria(t)?"":`<div class="grupo-head"><span class="grupo-count">${this.escapeHtml(this.resumoGrupoSquad(t,e,o))}</span></div>`;return`<div class="grupo ${n}">${head}<div class="grupo-lista">${c}</div></div>`}renderSubgrupoHtml(t,e){let n=this.grupoDefs.map(r=>this.renderGrupoHtml(t,r.key,r.cls,e.filter)).join("");if(!n)return"";let o=e.key!=="__flat__"?`<div class="subgrupo-head">${this.escapeHtml(e.label)}</div>`:"";return`<div class="subgrupo${e.key==="__flat__"?" flat":""}">${o}${n}</div>`}renderNodeHtml(t){let e=this.subgruposParaRender(t).map(b=>this.renderSubgrupoHtml(t,b)).join(""),n=this.filhosRenderVisiveisDe(t.id),o=n.length?`<div class="children">${n.map(b=>this.renderNodeHtml(b)).join("")}</div>`:"",r=t.descricao?`<div class="desc">${this.escapeHtml(t.descricao)}</div>`:"",c=e?`<div class="membros">${e}</div>`:"",p=this.paisVisiveisDoNode(t),m=p.length>1?`<div class="multi-parent-export">${p.map(b=>`<span>${this.escapeHtml(b.nome)}</span>`).join("")}</div>`:"",h=this.temValorAgregado(t)&&!this.ocultarValoresExport?`<div class="valor">\u03A3 LOs: <strong>${this.escapeHtml(this.formatCompact(this.valorAgregado(t)))}</strong></div>`:"";return`<div class="node t-${this.tipoClasse(t.tipo)}${p.length>1?" multi-parent":""}">
      ${m}
      <div class="card" data-node-id="${this.escapeHtml(t.id)}">
        <div class="tipo-row"><span class="tipo">${this.escapeHtml(this.rotuloNode(t))}</span>${this.renderFteChipHtml(t)}</div>
        <div class="nome">${this.escapeHtml(t.nome)}</div>
        ${r}${h}${this.renderFtePerfisHtml(t)}${c}${this.renderProjetosHtml(t)}
      </div>
      ${o}
    </div>`}

}
