import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-person-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './person-panel.component.html',
  styleUrl: './person-panel.component.scss'
})
export class PersonPanelComponent {
  private toast = inject(ToastService);
  @Input() perfis: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() consultorias: any[] = [];
  @Output() create = new EventEmitter<any>();
  @Output() update = new EventEmitter<any>();
  @Output() remove = new EventEmitter<string>();
  @Output() importCsv = new EventEmitter<File>();

  formExpanded = false;
  editingId = '';
  filtroAtivo: 'todos' | 'ativos' | 'inativos' = 'ativos';
  pessoa = { nome: '', perfilId: '', tipoVinculo: 'BV', consultoria: '', valorHora: null as number | null, valorMensal: null as number | null, vagaUrl: '', vagaAlias: '', dataNascimento: '', contato: '', ativo: true };
  vagasAnteriores: { alias: string; url: string; inicio: string; fim: string }[] = [];
  historicoExpanded = false;
  novaVaga = { alias: '', url: '', inicio: '', fim: '' };
  valorHoraMasked = '';
  valorMensalMasked = '';
  searchTerm = '';
  sortKey: 'nome' | 'perfilNome' | 'tipoVinculo' | 'consultoria' | 'valorHora' | 'valorMensal' = 'nome';
  sortDirection: 'asc' | 'desc' = 'asc';

  toggleForm() {
    this.formExpanded = !this.formExpanded;
  }

  startEdit(p: any) {
    this.editingId = p.id;
    this.formExpanded = true;
    this.historicoExpanded = false;
    this.novaVaga = { alias: '', url: '', inicio: '', fim: '' };
    this.vagasAnteriores = Array.isArray(p.vagasAnteriores)
      ? p.vagasAnteriores.map((v: any) => ({ alias: v.alias || '', url: v.url || '', inicio: v.inicio || '', fim: v.fim || '' }))
      : [];
    this.pessoa = {
      nome: p.nome,
      perfilId: p.perfilId,
      tipoVinculo: p.tipoVinculo || 'BV',
      consultoria: p.consultoria || '',
      valorHora: p.valorHora != null ? Number(p.valorHora) : null,
      valorMensal: this.calcularValorMensalMedio(p.valorHora),
      vagaUrl: p.vagaUrl || '',
      vagaAlias: p.vagaAlias || '',
      dataNascimento: p.dataNascimento || '',
      contato: p.contato || '',
      ativo: p.ativo !== false   
    };
    this.valorHoraMasked = this.formatCurrency(this.pessoa.valorHora ?? 0);
    this.valorMensalMasked = this.formatCurrency(this.pessoa.valorMensal ?? 0);
  }

  saveEdit() {
    if (!this.editingId) return;
    if (this.pessoa.tipoVinculo !== 'TERCEIRO') {
      this.pessoa.consultoria = '';
    }
    if (!this.perfilSelecionadoDebitaLo()) {
      this.pessoa.valorHora = null;
    }
    this.pessoa.valorMensal = this.calcularValorMensalMedio(this.pessoa.valorHora);
    this.update.emit({ id: this.editingId, ...this.pessoa, vagasAnteriores: [...this.vagasAnteriores] });
    this.editingId = '';
    this.formExpanded = false;
    this.vagasAnteriores = [];
    this.historicoExpanded = false;
  }

  cancelEdit() {
    this.editingId = '';
    this.formExpanded = false;
    this.vagasAnteriores = [];
    this.historicoExpanded = false;
  }

  adicionarVagaHistorico() {
    if (!this.novaVaga.alias.trim() && !this.novaVaga.url.trim()) return;
    this.vagasAnteriores = [
      { alias: this.novaVaga.alias.trim(), url: this.novaVaga.url.trim(), inicio: this.novaVaga.inicio, fim: this.novaVaga.fim },
      ...this.vagasAnteriores,
    ];
    this.novaVaga = { alias: '', url: '', inicio: '', fim: '' };
  }

  removerVagaHistorico(idx: number) {
    this.vagasAnteriores = this.vagasAnteriores.filter((_, i) => i !== idx);
  }

  fmtDate(d: string | null | undefined): string {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  submit() {
    if (this.pessoa.tipoVinculo !== 'TERCEIRO') {
      this.pessoa.consultoria = '';
    }
    if (!this.perfilSelecionadoDebitaLo()) {
      this.pessoa.valorHora = null;
    }
    this.create.emit({ ...this.pessoa, valorMensal: this.valorMensalMedioDaPessoa(this.pessoa) });
    this.pessoa = { nome: '', perfilId: '', tipoVinculo: 'BV', consultoria: '', valorHora: null, valorMensal: null, vagaUrl: '', vagaAlias: '', dataNascimento: '', contato: '', ativo: true };
    this.vagasAnteriores = [];
    this.historicoExpanded = false;
    this.valorHoraMasked = '';
    this.valorMensalMasked = '';
    this.formExpanded = false;
  }

  onTipoVinculoChange(tipo: string) {
    if (tipo !== 'TERCEIRO') {
      this.pessoa.consultoria = '';
    }
  }

  onPerfilChange() {
    if (!this.perfilSelecionadoDebitaLo()) {
      this.pessoa.valorHora = null;
      this.pessoa.valorMensal = null;
      this.valorHoraMasked = '';
      this.valorMensalMasked = '';
    }
  }

  onValorKeydown(event: KeyboardEvent) {
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) return;
    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  onValorHoraChange(value: string) {
    const digits = (value ?? '').replace(/\D/g, '');
    const cents = digits ? Number.parseInt(digits, 10) : 0;
    this.pessoa.valorHora = cents / 100;
    this.pessoa.valorMensal = this.calcularValorMensalMedio(this.pessoa.valorHora);
    this.valorHoraMasked = this.formatCurrency(this.pessoa.valorHora);
    this.valorMensalMasked = this.formatCurrency(this.pessoa.valorMensal);
  }

  onValorMensalMedioChange(value: string) {
    const digits = (value ?? '').replace(/\D/g, '');
    const cents = digits ? Number.parseInt(digits, 10) : 0;
    const mensal = cents / 100;
    this.pessoa.valorMensal = mensal;
    this.pessoa.valorHora = mensal / 160;
    this.valorHoraMasked = this.formatCurrency(this.pessoa.valorHora);
    this.valorMensalMasked = this.formatCurrency(this.pessoa.valorMensal);
  }

  labelTipoVinculo(tipo: string) {
    return tipo === 'TERCEIRO' ? 'Prestador de servico' : 'Folha';
  }

  toggleSort(key: 'nome' | 'perfilNome' | 'tipoVinculo' | 'consultoria' | 'valorHora' | 'valorMensal') {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDirection = 'asc';
  }

  sortedPessoas() {
    const query = this.searchTerm.trim().toLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.pessoas]
      .filter((p: any) => {
        if (this.filtroAtivo === 'ativos'   && p.ativo === false) return false;
        if (this.filtroAtivo === 'inativos' && p.ativo !== false) return false;
        if (!query) return true;
        return `${p?.nome ?? ''} ${p?.perfilNome ?? ''} ${this.labelTipoVinculo(p?.tipoVinculo)} ${p?.consultoria ?? ''} ${p?.valorHora ?? ''} ${this.calcularValorMensalMedio(p?.valorHora) ?? ''}`.toLowerCase().includes(query);
      })
      .sort((a: any, b: any) => {
      const av = this.sortKey === 'valorMensal' ? this.calcularValorMensalMedio(a?.valorHora) : a?.[this.sortKey];
      const bv = this.sortKey === 'valorMensal' ? this.calcularValorMensalMedio(b?.valorHora) : b?.[this.sortKey];
      if (typeof av === 'number' || typeof bv === 'number') return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
      return String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction;
    });
  }

  sortIndicator(key: 'nome' | 'perfilNome' | 'tipoVinculo' | 'consultoria' | 'valorHora' | 'valorMensal') {
    if (this.sortKey !== key) return '';
    return this.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
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
      format: 'nome,perfilNome,tipoVinculo,consultoria,valorHora,valorMensal',
      example: 'Maria Silva,Desenvolvedor Frontend Senior,BV,,,18500',
      onSelectFile: () => input.click()
    });
  }

  valorMensalMedioAtual(): string {
    if (!this.perfilSelecionadoDebitaLo()) return '-';
    if (this.valorMensalMasked) return this.valorMensalMasked;
    return this.formatCurrency(this.calcularValorMensalMedio(this.pessoa.valorHora));
  }

  valorMensalMedioDaPessoa(p: any): number {
    if (!this.pessoaDebitaLo(p)) return 0;
    return this.calcularValorMensalMedio(p?.valorHora);
  }

  perfilSelecionadoDebitaLo(): boolean {
    const perfil = this.perfis.find((x: any) => x.id === this.pessoa.perfilId);
    return perfil ? !!perfil.debitaLo : true;
  }

  pessoaDebitaLo(p: any): boolean {
    const perfil = this.perfis.find((x: any) => x.id === p?.perfilId);
    return perfil ? !!perfil.debitaLo : true;
  }

  fmtNascimento(d: string | null | undefined): string {
    if (!d) return '-';
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  }

  private calcularValorMensalMedio(valorHora: number | null | undefined): number {
    return (Number(valorHora) || 0) * 160;
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
