import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';
import { ToastService } from '../../core/toast.service';
import { PhotoUploadComponent } from '../photo-upload/photo-upload.component';

import { ScrollIntoViewWhenDirective } from "../../core/scroll-into-view-when.directive";

@Component({
  selector: 'app-person-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, PhotoUploadComponent, ScrollIntoViewWhenDirective, SearchableSelectDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './person-panel.component.html',
  styleUrl: './person-panel.component.scss'
})
export class PersonPanelComponent {
  private toast = inject(ToastService);
  @Input() perfis: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() consultorias: any[] = [];
  @Input() fotos: Record<string, string> = {};
  @Output() create = new EventEmitter<any>();
  @Output() update = new EventEmitter<any>();
  @Output() remove = new EventEmitter<string>();
  @Output() importCsv = new EventEmitter<File>();
  @Output() savePhoto = new EventEmitter<{ personId: string; dataUrl: string }>();

  // Modal de foto
  fotoModalAberto = false;
  fotoPessoaId = '';
  fotoPessoaNome = '';
  // Foto escolhida no formulário de uma pessoa NOVA (ainda sem id) — salva após o cadastro.
  fotoPendente = '';

  fotoDe(personId: string): string {
    return this.fotos?.[personId] || '';
  }

  iniciais(nome: string): string {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    const a = partes[0][0] || '';
    const b = partes.length > 1 ? (partes[partes.length - 1][0] || '') : '';
    return (a + b).toUpperCase();
  }

  // Foto a exibir no formulário: na edição usa a foto persistida; na criação usa a pendente.
  fotoFormPreview(): string {
    return this.editingId ? (this.fotoDe(this.editingId) || this.fotoPendente) : this.fotoPendente;
  }

  // Abre o modal de foto pela LINHA da tabela (pessoa já existente).
  abrirFoto(p: any) {
    this.fotoPessoaId = p.id;
    this.fotoPessoaNome = p.nome || '';
    this.fotoModalAberto = true;
  }

  // Abre o modal de foto a partir do FORMULÁRIO (criação ou edição).
  abrirFotoFormulario() {
    this.fotoPessoaId = this.editingId;   // vazio quando é criação
    this.fotoPessoaNome = this.pessoa.nome || 'nova pessoa';
    this.fotoModalAberto = true;
  }

  onFotoSalvar(dataUrl: string) {
    if (this.fotoPessoaId) {
      // Pessoa já existe (linha da tabela ou edição): salva imediatamente.
      this.savePhoto.emit({ personId: this.fotoPessoaId, dataUrl });
    } else {
      // Criação: guarda para salvar logo após cadastrar a pessoa.
      this.fotoPendente = dataUrl;
    }
    this.fotoModalAberto = false;
  }

  onFotoFechar() {
    this.fotoModalAberto = false;
  }

  formExpanded = false;
  saving = false;
  editingId = '';
  filtroAtivo: 'todos' | 'ativos' | 'inativos' = 'ativos';
  filtroPerfilId = '';
  filtroVinculo: '' | 'FOLHA' | 'TERCEIRO' = '';
  /** '' = todos os grupos; SEM_GRUPO = apenas pessoas sem grupo definido. */
  filtroGrupo = '';
  readonly SEM_GRUPO = '__sem_grupo__';
  pessoa = { nome: '', perfilId: '', tipoVinculo: 'BV', consultoria: '', valorHora: null as number | null, valorMensal: null as number | null, vagaUrl: '', vagaAlias: '', dataNascimento: '', contato: '', ativo: true, contaFte: true, grupos: [] as string[] };
  vagasAnteriores: { alias: string; url: string; inicio: string; fim: string }[] = [];
  historicoExpanded = false;
  novaVaga = { alias: '', url: '', inicio: '', fim: '' };
  valorHoraMasked = '';
  valorMensalMasked = '';
  searchTerm = '';
  currentPage = 1;
  pageSize = 10;
  sortKey: 'nome' | 'perfilNome' | 'tipoVinculo' | 'consultoria' | 'valorHora' | 'valorMensal' | 'grupos' = 'nome';
  sortDirection: 'asc' | 'desc' = 'asc';

  abrirNovo() {
    this.editingId = '';
    this.pessoa = { nome: '', perfilId: '', tipoVinculo: 'BV', consultoria: '', valorHora: null, valorMensal: null, vagaUrl: '', vagaAlias: '', dataNascimento: '', contato: '', ativo: true, contaFte: true, grupos: [] as string[] };
    this.vagasAnteriores = [];
    this.novoGrupo = '';
    this.historicoExpanded = false;
    this.valorHoraMasked = '';
    this.valorMensalMasked = '';
    this.fotoPendente = '';
    this.formExpanded = true;
  }

  get nomeValido() { return (this.pessoa.nome || '').trim().length > 0; }
  get perfilValido() { return !!(this.pessoa.perfilId || '').trim(); }
  get formValido() { return this.nomeValido && this.perfilValido; }

  startEdit(p: any) {
    this.editingId = p.id;
    this.formExpanded = true;
    this.historicoExpanded = false;
    this.fotoPendente = '';
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
      contato: this.formatContato(p.contato || ''),
      ativo: p.ativo !== false,
      contaFte: p.contaFte !== false,
      grupos: [...this.gruposDaPessoa(p)]
    };
    this.valorHoraMasked = this.formatValorHora(this.pessoa.valorHora ?? 0);
    this.valorMensalMasked = this.formatCurrency(this.pessoa.valorMensal ?? 0);
  }

  saveEdit() {
    if (!this.editingId || !this.formValido || this.saving) return;
    if (this.pessoa.tipoVinculo !== 'TERCEIRO') {
      this.pessoa.consultoria = '';
    }
    if (!this.perfilSelecionadoDebitaLo()) {
      this.pessoa.valorHora = null;
    }
    this.pessoa.valorMensal = this.calcularValorMensalMedio(this.pessoa.valorHora);
    this.saving = true;
    // So fecha o formulario quando o pai confirma sucesso; em erro, mantem aberto para correcao.
    this.update.emit({
      id: this.editingId,
      ...this.pessoa,
      vagasAnteriores: [...this.vagasAnteriores],
      onDone: (ok: boolean) => { this.saving = false; if (ok) this.resetForm(); }
    });
  }

  cancelEdit() {
    this.editingId = '';
    this.formExpanded = false;
    this.vagasAnteriores = [];
    this.historicoExpanded = false;
    this.fotoPendente = '';
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
    if (!this.formValido || this.saving) return;
    if (this.pessoa.tipoVinculo !== 'TERCEIRO') {
      this.pessoa.consultoria = '';
    }
    if (!this.perfilSelecionadoDebitaLo()) {
      this.pessoa.valorHora = null;
    }
    this.saving = true;
    // So limpa/fecha o formulario quando o pai confirma sucesso; em erro, mantem aberto para correcao.
    this.create.emit({
      ...this.pessoa,
      valorMensal: this.valorMensalMedioDaPessoa(this.pessoa),
      foto: this.fotoPendente || '',
      onDone: (ok: boolean) => { this.saving = false; if (ok) this.resetForm(); }
    });
  }

  private resetForm() {
    this.editingId = '';
    this.pessoa = { nome: '', perfilId: '', tipoVinculo: 'BV', consultoria: '', valorHora: null, valorMensal: null, vagaUrl: '', vagaAlias: '', dataNascimento: '', contato: '', ativo: true, contaFte: true, grupos: [] as string[] };
    this.vagasAnteriores = [];
    this.novoGrupo = '';
    this.historicoExpanded = false;
    this.valorHoraMasked = '';
    this.valorMensalMasked = '';
    this.fotoPendente = '';
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
    const millesimos = digits ? Number.parseInt(digits, 10) : 0;
    this.pessoa.valorHora = millesimos / 1000;
    this.pessoa.valorMensal = this.calcularValorMensalMedio(this.pessoa.valorHora);
    this.valorHoraMasked = this.formatValorHora(this.pessoa.valorHora);
    this.valorMensalMasked = this.formatCurrency(this.pessoa.valorMensal);
  }

  onValorMensalMedioChange(value: string) {
    const digits = (value ?? '').replace(/\D/g, '');
    const cents = digits ? Number.parseInt(digits, 10) : 0;
    const mensal = cents / 100;
    this.pessoa.valorMensal = mensal;
    this.pessoa.valorHora = mensal / 168;
    this.valorHoraMasked = this.formatValorHora(this.pessoa.valorHora);
    this.valorMensalMasked = this.formatCurrency(this.pessoa.valorMensal);
  }

  onContatoChange(value: string) {
    this.pessoa.contato = this.formatContato(value);
  }

  labelTipoVinculo(tipo: string) {
    return tipo === 'TERCEIRO' ? 'Prestador de servico' : 'Folha';
  }

  tipoVinculoFiltro(p: any): 'FOLHA' | 'TERCEIRO' {
    return String(p?.tipoVinculo || '').toUpperCase() === 'TERCEIRO' ? 'TERCEIRO' : 'FOLHA';
  }

  pessoaTemPerfilSelecionado(p: any): boolean {
    if (!this.filtroPerfilId) return true;
    if (String(p?.perfilId || '') === this.filtroPerfilId) return true;

    const perfil = this.perfis.find((item: any) => String(item?.id || '') === this.filtroPerfilId);
    const nomePerfil = String(perfil?.nomePerfil || '').trim().toLowerCase();
    if (!nomePerfil) return false;
    return String(p?.perfilNome || '').trim().toLowerCase() === nomePerfil;
  }

  /** Grupos cadastrados nas pessoas, sem repetição e em ordem alfabética. */
  gruposDisponiveis(): string[] {
    const set = new Set<string>();
    for (const p of this.pessoas) {
      for (const g of this.gruposDaPessoa(p)) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  /** Grupos da pessoa, já limpos. Uma pessoa pode pertencer a vários. */
  gruposDaPessoa(p: any): string[] {
    if (!Array.isArray(p?.grupos)) return [];
    return p.grupos.map((g: any) => String(g || '').trim()).filter(Boolean);
  }

  private mesmoGrupo(a: string, b: string): boolean {
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0;
  }

  private pessoaNoGrupoFiltrado(p: any): boolean {
    if (!this.filtroGrupo) return true;
    const grupos = this.gruposDaPessoa(p);
    if (this.filtroGrupo === this.SEM_GRUPO) return grupos.length === 0;
    return grupos.some(g => this.mesmoGrupo(g, this.filtroGrupo));
  }

  // ── grupos no formulário ──────────────────────────────────────────────────

  novoGrupo = '';

  adicionarGrupo() {
    const grupo = this.novoGrupo.trim();
    if (!grupo) return;
    if (!this.pessoa.grupos.some(g => this.mesmoGrupo(g, grupo))) this.pessoa.grupos = [...this.pessoa.grupos, grupo];
    this.novoGrupo = '';
  }

  removerGrupo(grupo: string) {
    this.pessoa.grupos = this.pessoa.grupos.filter(g => g !== grupo);
  }

  /** Grupos já existentes que a pessoa ainda não tem — alimenta o autocomplete. */
  gruposSugeridos(): string[] {
    return this.gruposDisponiveis().filter(g => !this.pessoa.grupos.some(x => this.mesmoGrupo(x, g)));
  }

  /** Valor usado na ordenação da coluna ativa; grupos ordenam pelo texto concatenado. */
  private valorDeOrdenacao(p: any) {
    if (this.sortKey === 'valorMensal') return this.calcularValorMensalMedio(p?.valorHora);
    if (this.sortKey === 'grupos') return this.gruposDaPessoa(p).join(', ');
    return p?.[this.sortKey];
  }

  toggleSort(key: 'nome' | 'perfilNome' | 'tipoVinculo' | 'consultoria' | 'valorHora' | 'valorMensal' | 'grupos') {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      this.currentPage = 1;
      return;
    }
    this.sortKey = key;
    this.sortDirection = 'asc';
    this.currentPage = 1;
  }

  sortedPessoas() {
    const query = this.searchTerm.trim().toLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.pessoas]
      .filter((p: any) => {
        if (this.filtroAtivo === 'ativos'   && p.ativo === false) return false;
        if (this.filtroAtivo === 'inativos' && p.ativo !== false) return false;
        if (!this.pessoaTemPerfilSelecionado(p)) return false;
        if (this.filtroVinculo && this.tipoVinculoFiltro(p) !== this.filtroVinculo) return false;
        if (!this.pessoaNoGrupoFiltrado(p)) return false;
        if (!query) return true;
        return `${p?.nome ?? ''} ${p?.perfilNome ?? ''} ${this.labelTipoVinculo(p?.tipoVinculo)} ${p?.consultoria ?? ''} ${this.gruposDaPessoa(p).join(' ')} ${p?.valorHora ?? ''} ${this.calcularValorMensalMedio(p?.valorHora) ?? ''}`.toLowerCase().includes(query);
      })
      .sort((a: any, b: any) => {
      const av = this.valorDeOrdenacao(a);
      const bv = this.valorDeOrdenacao(b);
      if (typeof av === 'number' || typeof bv === 'number') return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
      return String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction;
    });
  }

  paginatedPessoas() {
    const pessoas = this.sortedPessoas();
    const page = this.normalizedCurrentPage(pessoas.length);
    const start = (page - 1) * this.pageSize;
    return pessoas.slice(start, start + this.pageSize);
  }

  totalPessoasFiltradas(): number {
    return this.sortedPessoas().length;
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.totalPessoasFiltradas() / this.pageSize));
  }

  pageStart(): number {
    const total = this.totalPessoasFiltradas();
    if (!total) return 0;
    return (this.normalizedCurrentPage(total) - 1) * this.pageSize + 1;
  }

  pageEnd(): number {
    const total = this.totalPessoasFiltradas();
    return Math.min(this.normalizedCurrentPage(total) * this.pageSize, total);
  }

  pageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.normalizedCurrentPage();
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }

  currentPageView(): number {
    return this.normalizedCurrentPage();
  }

  goToPage(page: number) {
    this.currentPage = Math.min(Math.max(1, page), this.totalPages());
  }

  onPageFiltersChanged() {
    this.currentPage = 1;
  }

  onPageSizeChange(value: string | number) {
    this.pageSize = Number(value) || 10;
    this.currentPage = 1;
  }

  private normalizedCurrentPage(totalItems = this.totalPessoasFiltradas()): number {
    const totalPages = Math.max(1, Math.ceil(totalItems / this.pageSize));
    return Math.min(Math.max(1, this.currentPage), totalPages);
  }

  sortIndicator(key: 'nome' | 'perfilNome' | 'tipoVinculo' | 'consultoria' | 'valorHora' | 'valorMensal' | 'grupos') {
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
      format: 'nome,perfilNome,tipoVinculo,consultoria,valorHora,valorMensal,vagaUrl,vagaAlias,grupos',
      example: 'Maria Silva,Desenvolvedor Frontend Senior,BV,,,18500,,,Squad Pagamentos;Tribo Core',
      // colunas 7-9 (vagaUrl, vagaAlias, grupos) sao opcionais; varios grupos vao separados por ;
      onSelectFile: () => input.click()
    });
  }

  valorMensalMedioAtual(): string {
    if (!this.perfilSelecionadoDebitaLo()) return '-';
    if (this.valorMensalMasked) return this.valorMensalMasked;
    return this.formatCurrency(this.calcularValorMensalMedio(this.pessoa.valorHora ?? 0));
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
    return (Number(valorHora) || 0) * 168;
  }

  formatContato(value: string | null | undefined): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw;

    const digits = raw.replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  private formatValorHora(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
