import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-profile-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './profile-panel.component.html',
  styleUrl: './profile-panel.component.scss'
})
export class ProfilePanelComponent {
  private toast = inject(ToastService);
  @Input() perfis: any[] = [];
  @Output() create = new EventEmitter<{ nomePerfil: string; valorHora: number; nivel: string; departamento: string; observacoes: string; debitaLo: boolean }>();
  @Output() update = new EventEmitter<{ id: string; nomePerfil: string; valorHora: number; debitaLo: boolean }>();
  @Output() remove = new EventEmitter<string>();
  @Output() importCsv = new EventEmitter<File>();
  formExpanded = false;
  editingId = '';
  perfil = { nomePerfil: '', valorHora: 0, nivel: '', departamento: '', observacoes: '', debitaLo: true };
  valorHoraMasked = '';
  searchTerm = '';
  sortKey: 'nomePerfil' | 'debitaLo' | 'valorHora' = 'nomePerfil';
  sortDirection: 'asc' | 'desc' = 'asc';

  toggleForm() {
    this.formExpanded = !this.formExpanded;
  }

  onValorHoraChange(value: string) {
    const digits = (value ?? '').replace(/\D/g, '');
    const millesimos = digits ? Number.parseInt(digits, 10) : 0;
    this.perfil.valorHora = millesimos / 1000;
    this.valorHoraMasked = this.formatCurrency(this.perfil.valorHora);
  }

  submit() {
    this.create.emit(this.perfil);
    this.perfil = { nomePerfil: '', valorHora: 0, nivel: '', departamento: '', observacoes: '', debitaLo: true };
    this.valorHoraMasked = '';
    this.formExpanded = false;
  }

  startEdit(p: any) {
    this.editingId = p.id;
    const parsed = this.decompor(p.nomePerfil || '');
    this.perfil = {
      nomePerfil: parsed.base,
      valorHora: Number(p.valorHora),
      nivel: parsed.nivel,
      departamento: parsed.departamento,
      observacoes: parsed.observacoes,
      debitaLo: !!p.debitaLo
    };
    this.valorHoraMasked = this.formatCurrency(this.perfil.valorHora);
    this.formExpanded = true;
  }

  
  private decompor(nome: string): { base: string; nivel: string; departamento: string; observacoes: string } {
    let obs = '';
    let main = nome;
    
    const dashIdx = main.lastIndexOf(' - ');
    if (dashIdx >= 0) {
      obs = main.substring(dashIdx + 3).trim();
      main = main.substring(0, dashIdx).trim();
    }
    
    const partes = main.split(' | ').map(s => s.trim());
    return {
      base: partes[0] || '',
      nivel: partes[1] || '',
      departamento: partes[2] || '',
      observacoes: obs
    };
  }

  saveEdit() {
    if (!this.editingId) return;
    const nomeComContexto = [
      this.perfil.nomePerfil?.trim() || '',
      this.perfil.nivel?.trim() || '',
      this.perfil.departamento?.trim() || ''
    ].filter(Boolean).join(' | ');
    const nomeFinal = this.perfil.observacoes?.trim()
      ? `${nomeComContexto} - ${this.perfil.observacoes.trim()}`
      : nomeComContexto;
    this.update.emit({ id: this.editingId, nomePerfil: nomeFinal, valorHora: this.perfil.valorHora, debitaLo: this.perfil.debitaLo });
    this.cancelEdit();
  }

  cancelEdit() {
    this.editingId = '';
    this.formExpanded = false;
  }

  toggleSort(key: 'nomePerfil' | 'debitaLo' | 'valorHora') {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDirection = 'asc';
  }

  sortedPerfis() {
    const query = this.searchTerm.trim().toLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.perfis]
      .filter((p: any) => {
        if (!query) return true;
        return `${p?.nomePerfil ?? ''} ${p?.debitaLo ? 'sim' : 'nao'} ${p?.valorHora ?? ''}`.toLowerCase().includes(query);
      })
      .sort((a: any, b: any) => {
      const av = a?.[this.sortKey];
      const bv = b?.[this.sortKey];
      if (typeof av === 'number' || typeof bv === 'number') return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
      return String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction;
    });
  }

  sortIndicator(key: 'nomePerfil' | 'debitaLo' | 'valorHora') {
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
      format: 'nomePerfil,valorHora,debitaLo',
      example: 'Desenvolvedor Frontend Senior,150,true',
      onSelectFile: () => input.click()
    });
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }
}
