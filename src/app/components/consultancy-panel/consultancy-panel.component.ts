import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

import { ScrollIntoViewWhenDirective } from "../../core/scroll-into-view-when.directive";

@Component({
  selector: 'app-consultancy-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollIntoViewWhenDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './consultancy-panel.component.html',
  styleUrl: './consultancy-panel.component.scss'
})
export class ConsultancyPanelComponent {
  private toast = inject(ToastService);
  @Input() consultorias: any[] = [];
  @Output() create = new EventEmitter<{ nome: string; descricao: string; telefone: string; email: string }>();
  @Output() update = new EventEmitter<{ id: string; nome: string; descricao: string; telefone: string; email: string }>();
  @Output() remove = new EventEmitter<string>();
  @Output() importCsv = new EventEmitter<File>();

  formExpanded = false;
  editingId = '';
  consultoria = { nome: '', descricao: '', telefone: '', email: '' };
  searchTerm = '';
  sortKey: 'nome' | 'telefone' | 'email' | 'descricao' = 'nome';
  sortDirection: 'asc' | 'desc' = 'asc';

  abrirNovo() {
    this.editingId = '';
    this.consultoria = { nome: '', descricao: '', telefone: '', email: '' };
    this.formExpanded = true;
  }

  get nomeValido() { return (this.consultoria.nome || '').trim().length > 0; }
  get formValido() { return this.nomeValido; }

  submit() {
    if (!this.formValido) return;
    this.create.emit(this.consultoria);
    this.consultoria = { nome: '', descricao: '', telefone: '', email: '' };
    this.formExpanded = false;
  }

  startEdit(c: any) {
    this.editingId = c.id;
    this.formExpanded = true;
    this.consultoria = {
      nome: c.nome || '',
      descricao: c.descricao || '',
      telefone: this.formatPhone(c.telefone || c.contato || ''),
      email: c.email || ''
    };
  }

  saveEdit() {
    if (!this.editingId || !this.formValido) return;
    this.update.emit({ id: this.editingId, ...this.consultoria });
    this.cancelEdit();
  }

  cancelEdit() {
    this.editingId = '';
    this.consultoria = { nome: '', descricao: '', telefone: '', email: '' };
    this.formExpanded = false;
  }

  toggleSort(key: 'nome' | 'telefone' | 'email' | 'descricao') {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDirection = 'asc';
  }

  sortedConsultorias() {
    const query = this.searchTerm.trim().toLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.consultorias]
      .filter((c: any) => {
        if (!query) return true;
        return `${c?.nome ?? ''} ${c?.telefone ?? c?.contato ?? ''} ${c?.email ?? ''} ${c?.descricao ?? ''}`.toLowerCase().includes(query);
      })
      .sort((a: any, b: any) =>
        String(this.getSortValue(a, this.sortKey)).localeCompare(String(this.getSortValue(b, this.sortKey)), 'pt-BR', { sensitivity: 'base' }) * direction
      );
  }

  sortIndicator(key: 'nome' | 'telefone' | 'email' | 'descricao') {
    if (this.sortKey !== key) return '';
    return this.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
  }

  onPhoneInput() {
    this.consultoria.telefone = this.formatPhone(this.consultoria.telefone);
  }

  formatPhone(value: string) {
    const digits = (value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  copyValue(value: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).catch(() => {
      // no-op
    });
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
      format: 'nome,descricao,telefone,email',
      example: 'Consultoria XPTO,Bodyshop squad,(11) 99999-0000,contato@xpto.com',
      onSelectFile: () => input.click()
    });
  }

  private getSortValue(item: any, key: 'nome' | 'telefone' | 'email' | 'descricao') {
    if (key === 'telefone') return item?.telefone ?? item?.contato ?? '';
    if (key === 'email') return item?.email ?? '';
    return item?.[key] ?? '';
  }
}
