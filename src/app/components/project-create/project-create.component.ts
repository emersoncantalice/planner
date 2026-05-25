import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-project-create',
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styleUrl: './project-create.component.scss',
  templateUrl: './project-create.component.html'
})
export class ProjectCreateComponent {
  @Input() linhasOrcamentarias: any[] = [];
  @Input() businessEpics: any[] = [];
  @Input() showHeader = true;
  @Input() forceExpanded = false;
  @Output() openBudgetLines = new EventEmitter<void>();
  @Output() openBusinessEpics = new EventEmitter<void>();
  @Output() create = new EventEmitter<{
    nome: string;
    descricao: string;
    cliente: string;
    responsavel: string;
    inicioPrevisto: string;
    fimPrevisto: string;
    prioridade: string;
    linhaOrcamentariaId: string;
    businessEpicId: string;
    percentualLo: number | null;
    orcamentoPrevisto: number | null;
    precisaArquitetura: boolean;
  }>();

  projeto = {
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
    orcamentoPrevisto: null as number | null,
    precisaArquitetura: false
  };
  formExpanded = false;

  toggleForm() {
    this.formExpanded = !this.formExpanded;
  }

  shouldShowForm(): boolean {
    return this.forceExpanded || this.formExpanded;
  }

  onPercentualLoChange(value: number | string | null) {
    if (value === null || value === '') {
      this.projeto.percentualLo = null;
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      this.projeto.percentualLo = null;
      return;
    }
    this.projeto.percentualLo = Math.min(100, Math.max(0, parsed));
  }

  submit() {
    this.projeto.orcamentoPrevisto = this.orcamentoPrevistoDerivado();
    this.create.emit(this.projeto);
    this.projeto = {
      nome: '',
      descricao: '',
      cliente: '',
      responsavel: '',
      inicioPrevisto: '',
      fimPrevisto: '',
      prioridade: 'MEDIA',
      linhaOrcamentariaId: '',
      businessEpicId: '',
      percentualLo: null,
      orcamentoPrevisto: null,
      precisaArquitetura: false
    };
    if (!this.forceExpanded) this.formExpanded = false;
  }

  orcamentoPrevistoDerivado(): number {
    const lo = this.linhasOrcamentarias.find((x: any) => x.id === this.projeto.linhaOrcamentariaId);
    const totalLo = Number(lo?.valorTotal ?? 0);
    const percentual = Number(this.projeto.percentualLo ?? 0);
    if (!Number.isFinite(totalLo) || !Number.isFinite(percentual) || percentual <= 0) return 0;
    return (totalLo * percentual) / 100;
  }

  currency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
