import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

import { ScrollIntoViewWhenDirective } from "../../core/scroll-into-view-when.directive";

@Component({
  selector: 'app-budget-line-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollIntoViewWhenDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './budget-line-panel.component.html',
  styleUrl: './budget-line-panel.component.scss'
})
export class BudgetLinePanelComponent {
  private toast = inject(ToastService);
  @Input() linhas: any[] = [];
  @Input() ajustes: any[] = [];
  @Input() userRole = '';
  @Input() currentUser = '';
  @Output() create = new EventEmitter<{ codigo: string; nome: string; ano: number; tipo: string; centroCusto: string; valorTotal: number | null }>();
  @Output() update = new EventEmitter<{ id: string; codigo: string; nome: string; ano: number; tipo: string; centroCusto: string; valorTotal: number | null }>();
  @Output() remove = new EventEmitter<string>();
  @Output() importCsv = new EventEmitter<File>();
  @Output() createAdjustment = new EventEmitter<{ budgetLineId: string; tipo: string; descricao: string; valor: number | null }>();
  @Output() updateAdjustment = new EventEmitter<{ id: string; budgetLineId: string; tipo: string; descricao: string; valor: number | null }>();
  @Output() removeAdjustment = new EventEmitter<string>();
  @Output() updateLineSituacao = new EventEmitter<{ id: string; situacao: 'DRAFT' | 'PUBLISHED' }>();

  formExpanded = false;
  editingId = '';
  linha = { codigo: '', nome: '', ano: new Date().getFullYear(), tipo: 'RUN', centroCusto: '', valorTotal: null as number | null };
  valorTotalMasked = '';
  searchTerm = '';
  sortKey: 'codigo' | 'nome' | 'ano' | 'tipo' | 'centroCusto' | 'valorTotal' = 'codigo';
  sortDirection: 'asc' | 'desc' = 'asc';

  loHistoricoId = '';
  movimentacaoModalAberto = false;
  ajusteEditingId = '';
  ajuste = { budgetLineId: '', tipo: 'TASK', descricao: '', valor: null as number | null };
  ajusteValorMasked = '';

  toggleForm() {
    this.formExpanded = !this.formExpanded;
  }

  startEdit(lo: any) {
    this.editingId = lo.id;
    this.linha = { codigo: lo.codigo, nome: lo.nome, ano: Number(lo.ano || new Date().getFullYear()), tipo: lo.tipo, centroCusto: lo.centroCusto, valorTotal: Number(lo.valorTotal) };
    this.valorTotalMasked = this.formatCurrency(this.linha.valorTotal ?? 0);
    this.formExpanded = true;
  }

  onValorTotalChange(raw: string) {
    const digits = (raw || '').replace(/\D/g, '');
    const cents = Number(digits || '0');
    this.linha.valorTotal = cents / 100;
    this.valorTotalMasked = this.formatCurrency(this.linha.valorTotal);
  }

  createLine() {
    this.create.emit({ ...this.linha, ano: Number(this.linha.ano || new Date().getFullYear()) });
    this.resetForm();
    this.formExpanded = false;
  }

  saveEdit() {
    if (!this.editingId) return;
    this.update.emit({ id: this.editingId, ...this.linha, ano: Number(this.linha.ano || new Date().getFullYear()) });
    this.editingId = '';
    this.resetForm();
    this.formExpanded = false;
  }

  cancelEdit() {
    this.editingId = '';
    this.resetForm();
    this.formExpanded = false;
  }

  toggleSort(key: 'codigo' | 'nome' | 'ano' | 'tipo' | 'centroCusto' | 'valorTotal') {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDirection = 'asc';
  }

  sortedLinhas() {
    const query = this.searchTerm.trim().toLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.linhas]
      .filter((lo: any) => {
        if (!query) return true;
        return `${lo?.codigo ?? ''} ${lo?.nome ?? ''} ${lo?.ano ?? ''} ${lo?.tipo ?? ''} ${lo?.centroCusto ?? ''} ${lo?.valorTotal ?? ''}`.toLowerCase().includes(query);
      })
      .sort((a: any, b: any) => {
      const av = a?.[this.sortKey];
      const bv = b?.[this.sortKey];
      if (typeof av === 'number' || typeof bv === 'number') return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
      return String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction;
    });
  }

  sortIndicator(key: 'codigo' | 'nome' | 'ano' | 'tipo' | 'centroCusto' | 'valorTotal') {
    if (this.sortKey !== key) return '';
    return this.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
  }

  selecionarLoHistorico(loId: string) {
    this.loHistoricoId = loId;
    this.movimentacaoModalAberto = true;
    if (!this.ajusteEditingId) {
      this.ajuste.budgetLineId = loId;
    }
  }

  fecharMovimentacaoModal() {
    this.movimentacaoModalAberto = false;
    this.cancelarAjuste();
  }

  onAjusteValorChange(raw: string) {
    const digits = (raw || '').replace(/\D/g, '');
    const cents = Number(digits || '0');
    this.ajuste.valor = cents / 100;
    this.ajusteValorMasked = this.formatCurrency(this.ajuste.valor);
  }

  criarAjuste() {
    if (!this.ajuste.budgetLineId && this.loHistoricoId) {
      this.ajuste.budgetLineId = this.loHistoricoId;
    }
    this.createAdjustment.emit(this.ajuste);
    this.ajuste = { budgetLineId: this.loHistoricoId || '', tipo: 'TASK', descricao: '', valor: null };
    this.ajusteValorMasked = '';
  }

  editarAjuste(a: any) {
    this.ajusteEditingId = a.id;
    this.loHistoricoId = a.budgetLineId;
    this.ajuste = {
      budgetLineId: a.budgetLineId,
      tipo: a.tipo,
      descricao: a.descricao || '',
      valor: Number(a.valor || 0)
    };
    this.ajusteValorMasked = this.formatCurrency(this.ajuste.valor || 0);
  }

  salvarAjuste() {
    if (!this.ajusteEditingId) return;
    this.updateAdjustment.emit({ id: this.ajusteEditingId, ...this.ajuste });
    this.cancelarAjuste();
  }

  cancelarAjuste() {
    this.ajusteEditingId = '';
    this.ajuste = { budgetLineId: this.loHistoricoId || '', tipo: 'TASK', descricao: '', valor: null };
    this.ajusteValorMasked = '';
  }

  ajustesDaLo() {
    if (!this.loHistoricoId) return [];
    return this.ajustes
      .filter((a: any) => a.budgetLineId === this.loHistoricoId)
      .sort((a: any, b: any) => String(b?.criadoEm ?? '').localeCompare(String(a?.criadoEm ?? '')));
  }

  saldoAtualLo(lo: any): number {
    const base = Number(lo?.valorTotal || 0);
    const delta = this.ajustes
      .filter((a: any) => a.budgetLineId === lo.id)
      .reduce((acc: number, a: any) => {
        const valor = Number(a?.valor || 0);
        return acc + (String(a?.tipo || '').toUpperCase() === 'APORTE' ? valor : -valor);
      }, 0);
    return base + delta;
  }

  historicoDescritivoLo(): string {
    const items = this.ajustesDaLo();
    if (!items.length) return 'Sem movimentacoes cadastradas.';
    return items
      .map((a: any) => {
        const sinal = String(a.tipo || '').toUpperCase() === 'APORTE' ? '+' : '-';
        const data = a.criadoEm ? new Date(a.criadoEm).toLocaleDateString('pt-BR') : '-';
        return `${data} | ${a.tipo} | ${sinal}${this.formatCurrency(Number(a.valor || 0))} | ${a.descricao || ''}`;
      })
      .join('\n');
  }

  valorImpacto(a: any): number {
    const valor = Number(a?.valor || 0);
    return String(a?.tipo || '').toUpperCase() === 'APORTE' ? valor : -valor;
  }

  onCsvSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this.importCsv.emit(file);
    input.value = '';
  }

  openCsvPicker(input: HTMLInputElement) {
    this.toast.showCsv({
      format: 'codigo,nome,ano,tipo,centroCusto,valorTotal',
      example: 'LO-2026-001,Plataforma Core,2026,RUN,TI-DIGITAL,120000',
      onSelectFile: () => input.click()
    });
  }

  isDraftLo(lo: any): boolean {
    return (lo.situacao || 'PUBLISHED') === 'DRAFT';
  }

  situacaoLoLabel(lo: any): string {
    return this.isDraftLo(lo) ? 'Rascunho' : 'Publicado';
  }

  canToggleLoSituacao(lo: any): boolean {
    if (this.userRole === 'ADMIN') return true;
    return !!this.currentUser && lo.dono === this.currentUser;
  }

  toggleLoSituacao(lo: any) {
    const next: 'DRAFT' | 'PUBLISHED' = this.isDraftLo(lo) ? 'PUBLISHED' : 'DRAFT';
    this.updateLineSituacao.emit({ id: lo.id, situacao: next });
  }

  private formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private resetForm() {
    this.linha = {
      codigo: '',
      nome: '',
      ano: new Date().getFullYear(),
      tipo: 'RUN',
      centroCusto: '',
      valorTotal: null
    };
    this.valorTotalMasked = '';
  }
}
