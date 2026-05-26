import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-business-epic-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './business-epic-panel.component.html',
  styleUrl: './business-epic-panel.component.scss'
})
export class BusinessEpicPanelComponent {
  private toast = inject(ToastService);
  @Input() epics: any[] = [];
  @Output() create = new EventEmitter<{ nome: string; aliasLink: string; jiraUrl: string; inicio: string | null; fim: string | null }>();
  @Output() update = new EventEmitter<{ id: string; nome: string; aliasLink: string; jiraUrl: string; inicio: string | null; fim: string | null }>();
  @Output() remove = new EventEmitter<string>();
  @Output() importCsv = new EventEmitter<File>();
  formExpanded = false;
  editingId = '';
  epic = { nome: '', aliasLink: '', jiraUrl: '', inicio: null as string | null, fim: null as string | null };
  searchTerm = '';
  sortKey: 'nome' | 'jiraUrl' | 'inicio' | 'fim' = 'nome';
  sortDirection: 'asc' | 'desc' = 'asc';

  toggleForm() {
    this.formExpanded = !this.formExpanded;
  }

  submit() {
    this.create.emit(this.epic);
    this.epic = { nome: '', aliasLink: '', jiraUrl: '', inicio: null, fim: null };
    this.formExpanded = false;
  }

  startEdit(e: any) {
    this.editingId = e.id;
    this.epic = {
      nome: e.nome,
      aliasLink: e.aliasLink || '',
      jiraUrl: e.jiraUrl,
      inicio: e.inicio ? String(e.inicio).substring(0, 10) : null,
      fim: e.fim ? String(e.fim).substring(0, 10) : null
    };
    this.formExpanded = true;
  }

  saveEdit() {
    if (!this.editingId) return;
    this.update.emit({ id: this.editingId, ...this.epic });
    this.editingId = '';
    this.formExpanded = false;
  }

  cancelEdit() {
    this.editingId = '';
    this.formExpanded = false;
  }

  toggleSort(key: 'nome' | 'jiraUrl' | 'inicio' | 'fim') {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDirection = 'asc';
  }

  sortedEpics() {
    const query = this.searchTerm.trim().toLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.epics]
      .filter((e: any) => {
        if (!query) return true;
        return `${e?.nome ?? ''} ${e?.jiraUrl ?? ''} ${e?.inicio ?? ''} ${e?.fim ?? ''}`.toLowerCase().includes(query);
      })
      .sort((a: any, b: any) =>
        String(a?.[this.sortKey] ?? '').localeCompare(String(b?.[this.sortKey] ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction
      );
  }

  sortIndicator(key: 'nome' | 'jiraUrl' | 'inicio' | 'fim') {
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
      format: 'nome,aliasLink,jiraUrl,inicio,fim',
      example: 'Epic Pagamentos,Jira Epic,https://jira.exemplo/EPIC-123,2026-01-10,2026-03-30',
      onSelectFile: () => input.click()
    });
  }
}
