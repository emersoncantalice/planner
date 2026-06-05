import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

import { ScrollIntoViewWhenDirective } from "../../core/scroll-into-view-when.directive";

@Component({
  selector: 'app-focal-point-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollIntoViewWhenDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './focal-point-panel.component.html',
  styleUrl: './focal-point-panel.component.scss'
})
export class FocalPointPanelComponent {
  private toast = inject(ToastService);
  @Input() pontosFocais: any[] = [];
  @Output() create = new EventEmitter<{ area: string; responsavelPor: string; email: string; telefone: string }>();
  @Output() update = new EventEmitter<{ id: string; area: string; responsavelPor: string; email: string; telefone: string }>();
  @Output() remove = new EventEmitter<string>();
  @Output() importCsv = new EventEmitter<File>();

  formExpanded = false;
  editingId = '';
  pontoFocal = { area: '', responsavelPor: '', email: '', telefone: '' };
  searchTerm = '';
  sortKey: 'area' | 'responsavelPor' | 'email' | 'telefone' = 'area';
  sortDirection: 'asc' | 'desc' = 'asc';

  toggleForm() {
    this.formExpanded = !this.formExpanded;
  }

  submit() {
    this.create.emit(this.pontoFocal);
    this.pontoFocal = { area: '', responsavelPor: '', email: '', telefone: '' };
    this.formExpanded = false;
  }

  startEdit(p: any) {
    this.editingId = p.id;
    this.formExpanded = true;
    this.pontoFocal = {
      area: p.area || '',
      responsavelPor: p.responsavelPor || '',
      email: p.email || '',
      telefone: this.formatPhone(p.telefone || '')
    };
  }

  saveEdit() {
    if (!this.editingId) return;
    this.update.emit({ id: this.editingId, ...this.pontoFocal });
    this.cancelEdit();
  }

  cancelEdit() {
    this.editingId = '';
    this.pontoFocal = { area: '', responsavelPor: '', email: '', telefone: '' };
    this.formExpanded = false;
  }

  toggleSort(key: 'area' | 'responsavelPor' | 'email' | 'telefone') {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDirection = 'asc';
  }

  sortedPontosFocais() {
    const query = this.searchTerm.trim().toLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.pontosFocais]
      .filter((p: any) => {
        if (!query) return true;
        return `${p?.area ?? ''} ${p?.responsavelPor ?? ''} ${p?.email ?? ''} ${p?.telefone ?? ''}`.toLowerCase().includes(query);
      })
      .sort((a: any, b: any) =>
        String(a?.[this.sortKey] ?? '').localeCompare(String(b?.[this.sortKey] ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction
      );
  }

  sortIndicator(key: 'area' | 'responsavelPor' | 'email' | 'telefone') {
    if (this.sortKey !== key) return '';
    return this.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
  }

  onPhoneInput() {
    this.pontoFocal.telefone = this.formatPhone(this.pontoFocal.telefone);
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
      format: 'area,responsavelPor,email,telefone',
      example: 'Riscos e Controles,Gestao de riscos,risco@empresa.com,(11) 98888-7777',
      onSelectFile: () => input.click()
    });
  }

  private formatPhone(value: string) {
    const digits = (value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
}
