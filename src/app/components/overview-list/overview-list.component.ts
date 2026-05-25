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
  @Output() updateProject = new EventEmitter<{ id: string; nome: string; descricao: string }>();
  @Output() deleteProject = new EventEmitter<string>();
  @Output() updateProjectSituacao = new EventEmitter<{ id: string; situacao: 'DRAFT' | 'PUBLISHED' }>();
  editingProjectId = '';
  projectForm = { nome: '', descricao: '' };
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

  startEditProject(r: any) {
    this.editingProjectId = r.id;
    this.projectForm = { nome: r.nome ?? '', descricao: r.descricao ?? '' };
  }

  saveEditProject() {
    if (!this.editingProjectId) return;
    this.updateProject.emit({ id: this.editingProjectId, ...this.projectForm });
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
