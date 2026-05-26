import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-overview-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: {
    '[class.list-only]': 'showList && !showDashboard && !showChart',
    '[class.dashboard-only]': 'showDashboard && !showList && !showChart'
  },
  templateUrl: './overview-list.component.html',
  styleUrl: './overview-list.component.scss'
})
export class OverviewListComponent {
  @Input() resumo: any[] = [];
  @Input() linhasOrcamentarias: any[] = [];
  @Input() alocacoesLo: any[] = [];
  @Input() showDashboard = true;
  @Input() showChart = true;
  @Input() showList = true;
  @Input() userRole = '';
  @Input() currentUser = '';
  @Output() select = new EventEmitter<string>();
  @Output() openCreateProject = new EventEmitter<void>();
  @Output() exportJira = new EventEmitter<void>();
  @Input() businessEpics: any[] = [];
  @Output() updateProject = new EventEmitter<{ id: string; nome: string; descricao: string }>();
  @Output() deleteProject = new EventEmitter<string>();
  @Output() updateProjectSituacao = new EventEmitter<{ id: string; situacao: 'DRAFT' | 'PUBLISHED' }>();
  editingProjectId = '';
  projectForm = {
    nome: '',
    descricao: '',
    cliente: '',
    responsavel: '',
    inicioPrevisto: '',
    fimPrevisto: '',
    prioridade: 'MEDIA',
    linhaOrcamentariaId: '',
    businessEpicId: '',
    percentualLo: null as number | null,
  };
  anoSelecionado = new Date().getFullYear();
  searchTerm = '';

  currency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  number(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  ngOnChanges(_changes: SimpleChanges): void {
    const anos = this.anosDisponiveis();
    if (!anos.includes(this.anoSelecionado)) {
      this.anoSelecionado = anos[0] ?? new Date().getFullYear();
    }
  }

  anosDisponiveis(): number[] {
    const anoAtual = new Date().getFullYear();
    const anos = Array.from(
      new Set(this.linhasOrcamentarias.map((lo: any) => Number(lo?.ano || 0)).filter((a: number) => a > 0))
    ).sort((a, b) => b - a);
    if (!anos.includes(anoAtual)) anos.unshift(anoAtual);
    return anos.length ? anos : [anoAtual];
  }

  selecionarAno(ano: number) {
    this.anoSelecionado = Number(ano || new Date().getFullYear());
  }

  linhasOrcamentariasDoAno(): any[] {
    return this.linhasOrcamentarias.filter((lo: any) => Number(lo?.ano) === Number(this.anoSelecionado));
  }

  private idsLoAno(): Set<string> {
    return new Set(this.linhasOrcamentariasDoAno().map((lo: any) => lo.id));
  }

  totalLo(): number {
    return this.linhasOrcamentariasDoAno().reduce((acc, lo) => acc + this.number(lo.valorTotal), 0);
  }

  totalComprometidoLo(): number {
    const ids = this.idsLoAno();
    return this.alocacoesLo
      .filter((a: any) => ids.has(a.linhaOrcamentariaId))
      .reduce((acc, a) => acc + this.number(a.custoPlanejado), 0);
  }

  saldoLo(): number {
    return this.totalLo() - this.totalComprometidoLo();
  }

  projetosConcluidos(): number {
    return this.resumo.filter(r => (r.status || '').toUpperCase() === 'CONCLUIDO').length;
  }

  progressoMedio(): number {
    if (!this.resumo.length) return 0;
    const total = this.resumo.reduce((acc, r) => acc + this.number(r.percentualConclusao), 0);
    return Math.round(total / this.resumo.length);
  }

  maxCustoEquipe(): number {
    const values = this.resumo.map(r => this.number(r.custoPlanejadoEquipe));
    return values.length ? Math.max(...values, 1) : 1;
  }

  private parseDetailLine(text: string, key: string): string {
    const m = text.match(new RegExp(`- ${key}: (.+)`));
    return m?.[1]?.trim() ?? '';
  }

  private parsePlainLine(text: string, key: string): string {
    const m = text.match(new RegExp(`^${key}: (.+)`, 'm'));
    return m?.[1]?.trim() ?? '';
  }

  startEditProject(r: any) {
    this.editingProjectId = r.id;
    const raw = r.descricao ?? '';

    const detailsIdx = raw.indexOf('Detalhes do projeto');
    const freeText   = (detailsIdx >= 0 ? raw.slice(0, detailsIdx) : raw).trim();
    const detailsText = detailsIdx >= 0 ? raw.slice(detailsIdx) : '';

    // LO: "LO vinculada: CODIGO - Nome"
    const loStr  = this.parseDetailLine(detailsText, 'LO vinculada');
    const loCode = loStr.split(' - ')[0]?.trim() ?? '';
    const lo     = this.linhasOrcamentarias.find((x: any) => x.codigo === loCode);

    // Business Epic: search block after "Business Epic"
    const epicIdx  = raw.indexOf('Business Epic');
    const epicText = epicIdx >= 0 ? raw.slice(epicIdx) : '';
    const epicName = this.parsePlainLine(epicText, 'Nome');
    const epic     = this.businessEpics.find((x: any) => x.nome === epicName);

    // percentualLo: "Percentual da LO: X%"
    const pctStr    = this.parseDetailLine(detailsText, 'Percentual da LO').replace('%', '').trim();
    const percentualLo = pctStr ? (parseFloat(pctStr) || null) : null;

    this.projectForm = {
      nome:                r.nome ?? '',
      descricao:           freeText,
      cliente:             this.parseDetailLine(detailsText, 'Cliente/Area'),
      responsavel:         this.parseDetailLine(detailsText, 'Responsavel'),
      inicioPrevisto:      this.parseDetailLine(detailsText, 'Inicio previsto'),
      fimPrevisto:         this.parseDetailLine(detailsText, 'Fim previsto'),
      prioridade:          this.parseDetailLine(detailsText, 'Prioridade') || 'MEDIA',
      linhaOrcamentariaId: lo?.id ?? '',
      businessEpicId:      epic?.id ?? '',
      percentualLo,
    };
  }

  orcamentoPrevistoDerivadoEdit(): number {
    const lo = this.linhasOrcamentarias.find((x: any) => x.id === this.projectForm.linhaOrcamentariaId);
    const totalLo   = Number(lo?.valorTotal ?? 0);
    const percentual = Number(this.projectForm.percentualLo ?? 0);
    if (!Number.isFinite(totalLo) || !Number.isFinite(percentual) || percentual <= 0) return 0;
    return (totalLo * percentual) / 100;
  }

  onPercentualLoEditChange(value: number | string | null) {
    if (value === null || value === '') { this.projectForm.percentualLo = null; return; }
    const parsed = Number(value);
    this.projectForm.percentualLo = !Number.isFinite(parsed) ? null : Math.min(100, Math.max(0, parsed));
  }

  saveEditProject() {
    if (!this.editingProjectId) return;

    const lo   = this.linhasOrcamentarias.find((x: any) => x.id === this.projectForm.linhaOrcamentariaId);
    const epic = this.businessEpics.find((x: any) => x.id === this.projectForm.businessEpicId);

    const detalhes: string[] = [];
    if (lo)                              detalhes.push(`LO vinculada: ${lo.codigo} - ${lo.nome}`);
    if (this.projectForm.cliente)        detalhes.push(`Cliente/Area: ${this.projectForm.cliente}`);
    if (this.projectForm.responsavel)    detalhes.push(`Responsavel: ${this.projectForm.responsavel}`);
    if (this.projectForm.inicioPrevisto) detalhes.push(`Inicio previsto: ${this.projectForm.inicioPrevisto}`);
    if (this.projectForm.fimPrevisto)    detalhes.push(`Fim previsto: ${this.projectForm.fimPrevisto}`);
    if (this.projectForm.prioridade)     detalhes.push(`Prioridade: ${this.projectForm.prioridade}`);
    if (this.projectForm.percentualLo != null) detalhes.push(`Percentual da LO: ${this.projectForm.percentualLo}%`);
    const orcamento = this.orcamentoPrevistoDerivadoEdit();
    if (orcamento > 0) {
      detalhes.push(`Orcamento previsto: ${orcamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    }

    const epicTexto = epic ? [
      'Business Epic',
      `Nome: ${epic.nome}`,
      `Alias: ${epic.aliasLink || '-'}`,
      `Jira: ${epic.jiraUrl || '-'}`,
      `Janela: ${epic.inicio || '-'} ate ${epic.fim || '-'}`
    ].join('\n') : '';

    const descricaoFinal = [
      this.projectForm.descricao?.trim() || '',
      detalhes.length ? ['Detalhes do projeto', ...detalhes.map(d => `- ${d}`)].join('\n') : '',
      epicTexto
    ].filter(Boolean).join('\n\n');

    this.updateProject.emit({ id: this.editingProjectId, nome: this.projectForm.nome, descricao: descricaoFinal });
    this.editingProjectId = '';
  }

  cancelEditProject() {
    this.editingProjectId = '';
  }

  situacaoLabel(r: any): string {
    return (r.situacao || 'PUBLISHED') === 'DRAFT' ? 'Rascunho' : 'Publicado';
  }

  isDraft(r: any): boolean {
    return (r.situacao || 'PUBLISHED') === 'DRAFT';
  }

  canToggleSituacao(r: any): boolean {
    if (this.userRole === 'ADMIN') return true;
    return this.currentUser && r.donoProjeto && r.donoProjeto === this.currentUser;
  }

  toggleSituacao(r: any) {
    const next: 'DRAFT' | 'PUBLISHED' = this.isDraft(r) ? 'PUBLISHED' : 'DRAFT';
    this.updateProjectSituacao.emit({ id: r.id, situacao: next });
  }

  filteredResumo(): any[] {
    const q = this.searchTerm.trim().toLowerCase();
    if (!q) return this.resumo;
    return this.resumo.filter((r: any) => {
      const blob = [
        r?.nome,
        r?.descricao,
        r?.status,
        r?.responsavel,
        r?.cliente
      ].map(v => String(v ?? '').toLowerCase()).join(' ');
      return blob.includes(q);
    });
  }
}
