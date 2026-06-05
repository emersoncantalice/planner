import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

import { ScrollIntoViewWhenDirective } from "../../core/scroll-into-view-when.directive";

@Component({
  selector: 'app-incident-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollIntoViewWhenDirective],
  templateUrl: './incident-panel.component.html',
  styleUrl: './incident-panel.component.scss'
})
export class IncidentPanelComponent {
  private toast = inject(ToastService);
  @Input() incidentes: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() usuariosSistema: string[] = [];
  @Output() create = new EventEmitter<any>();
  @Output() update = new EventEmitter<any>();
  @Output() remove = new EventEmitter<string>();
  @Output() importCsv = new EventEmitter<File>();
  @Input()  currentUser = '';
  @Output() transferOwnership = new EventEmitter<{ id: string; novoDono: string }>();

  transferId    = '';
  transferInput = '';

  isDono(item: any): boolean {
    const role = (localStorage.getItem('planner_role') || '').trim();
    if (role === 'ADMIN') return true;
    if (!item?.criadoPor) return true;
    return item.criadoPor.toLowerCase() === (this.currentUser || '').toLowerCase();
  }
  iniciarTransferencia(id: string) { this.transferId = id; this.transferInput = ''; }
  cancelarTransferencia()           { this.transferId = ''; this.transferInput = ''; }
  confirmarTransferencia()          {
    if (!this.transferInput.trim()) return;
    this.transferOwnership.emit({ id: this.transferId, novoDono: this.transferInput.trim() });
    this.cancelarTransferencia();
  }

  usuariosTransferenciaFiltrados(): string[] {
    const base = Array.from(new Set((this.usuariosSistema || [])
      .map((u: any) => String(u || '').trim())
      .filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const q = this.transferInput.trim().toLowerCase();
    if (!q) return base;
    return base.filter(n => n.toLowerCase().includes(q));
  }

  formExpanded = false;
  editingId = '';
  searchTerm = '';
  sortKey: string = 'dataOcorrencia';
  sortDir: 'asc' | 'desc' = 'desc';
  detalheId = '';
  historicoAberto = new Set<string>();

  form = this.emptyForm();

  onCsvSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this.importCsv.emit(file);
    input.value = '';
  }

  openCsvPicker(input: HTMLInputElement) {
    this.toast.showCsv({
      format: 'titulo,descricao,tipo,severidade,status,responsavel,dataOcorrencia,dataResolucao,impacto,causaRaiz,acoesCorrativas',
      example: 'Falha no deploy,Pipeline falhou em producao,INTEGRACAO,P2_ALTO,ABERTO,Luis Felipe Auth,2026-06-10,,Servico indisponivel,Timeout no gateway,Reprocessar pipeline',
      onSelectFile: () => input.click()
    });
  }

  
  readonly tipos = [
    { value: 'DISPONIBILIDADE', label: 'Disponibilidade' },
    { value: 'PERFORMANCE',     label: 'Performance' },
    { value: 'SEGURANCA',       label: 'Segurança' },
    { value: 'DADOS',           label: 'Dados' },
    { value: 'INTEGRACAO',      label: 'Integração' },
    { value: 'OUTROS',          label: 'Outros' },
  ];

  readonly severidades = [
    { value: 'P1_CRITICO', label: 'P1 – Crítico' },
    { value: 'P2_ALTO',    label: 'P2 – Alto' },
    { value: 'P3_MEDIO',   label: 'P3 – Médio' },
    { value: 'P4_BAIXO',   label: 'P4 – Baixo' },
  ];

  readonly statusOpts = [
    { value: 'ABERTO',          label: 'Aberto' },
    { value: 'EM_INVESTIGACAO', label: 'Em Investigação' },
    { value: 'RESOLVIDO',       label: 'Resolvido' },
    { value: 'POS_MORTEM',      label: 'Pós-Mortem' },
  ];

  
  toggleForm() {
    this.formExpanded = !this.formExpanded;
    if (this.formExpanded) { this.editingId = ''; this.form = this.emptyForm(); }
  }

  startEdit(inc: any) {
    this.editingId = inc.id;
    this.formExpanded = true;
    this.detalheId = '';
    this.form = {
      titulo:          inc.titulo ?? '',
      descricao:       inc.descricao ?? '',
      tipo:            inc.tipo ?? 'OUTROS',
      severidade:      inc.severidade ?? 'P3_MEDIO',
      status:          inc.status ?? 'ABERTO',
      responsavel:     inc.responsavel ?? '',
      dataOcorrencia:  this.toDateInput(inc.dataOcorrencia),
      dataResolucao:   this.toDateInput(inc.dataResolucao),
      impacto:         inc.impacto ?? '',
      causaRaiz:       inc.causaRaiz ?? '',
      acoesCorrativas: inc.acoesCorrativas ?? '',
    };
  }

  cancelEdit() {
    this.editingId = '';
    this.formExpanded = false;
    this.form = this.emptyForm();
  }

  submit() {
    const payload = {
      ...this.form,
      dataOcorrencia: this.toISO(this.form.dataOcorrencia),
      dataResolucao:  this.toISO(this.form.dataResolucao),
    };
    if (this.editingId) {
      this.update.emit({ id: this.editingId, ...payload });
    } else {
      this.create.emit(payload);
    }
    this.cancelEdit();
  }

  pessoasAtivas() {
    return this.pessoas.filter((p: any) => p.ativo !== false);
  }

  excluir(id: string) {
    this.remove.emit(id);
  }

  toggleDetalhe(id: string) {
    this.detalheId = this.detalheId === id ? '' : id;
    if (this.detalheId !== id) this.historicoAberto.delete(id);
  }

  toggleHistorico(id: string) {
    if (this.historicoAberto.has(id)) {
      this.historicoAberto.delete(id);
    } else {
      this.historicoAberto.add(id);
    }
  }

  
  toggleSort(key: string) {
    if (this.sortKey === key) { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; return; }
    this.sortKey = key;
    this.sortDir = 'asc';
  }

  sortIndicator(key: string) {
    if (this.sortKey !== key) return '';
    return this.sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  filteredSorted(): any[] {
    const q = this.searchTerm.trim().toLowerCase();
    const dir = this.sortDir === 'asc' ? 1 : -1;
    return [...this.incidentes]
      .filter(i => !q || `${i.titulo} ${i.tipo} ${i.severidade} ${i.status} ${i.responsavel} ${i.impacto}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (this.sortKey === 'dataOcorrencia' || this.sortKey === 'dataResolucao') {
          return (this.epoch(a[this.sortKey]) - this.epoch(b[this.sortKey])) * dir;
        }
        return String(a[this.sortKey] ?? '').localeCompare(String(b[this.sortKey] ?? ''), 'pt-BR', { sensitivity: 'base' }) * dir;
      });
  }

  
  severidadeLabel(s: string) { return this.severidades.find(x => x.value === s)?.label ?? s; }
  tipoLabel(t: string)       { return this.tipos.find(x => x.value === t)?.label ?? t; }
  statusLabel(s: string)     { return this.statusOpts.find(x => x.value === s)?.label ?? s; }

  severidadeBadge(s: string) {
    if (s === 'P1_CRITICO') return 'badge-p1';
    if (s === 'P2_ALTO')    return 'badge-p2';
    if (s === 'P3_MEDIO')   return 'badge-p3';
    return 'badge-p4';
  }

  statusBadge(s: string) {
    if (s === 'RESOLVIDO')      return 'badge-resolvido';
    if (s === 'EM_INVESTIGACAO')return 'badge-investigacao';
    if (s === 'POS_MORTEM')     return 'badge-pos-mortem';
    return 'badge-aberto';
  }

  formatDate(value: any) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  }

  formatDateTime(value: any) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  histTipoLabel(tipo: string) {
    if (tipo === 'CRIACAO') return 'Criação';
    if (tipo === 'STATUS')  return 'Status';
    if (tipo === 'EDICAO')  return 'Edição';
    return tipo;
  }

  
  private emptyForm() {
    return {
      titulo: '', descricao: '', tipo: 'DISPONIBILIDADE', severidade: 'P3_MEDIO',
      status: 'ABERTO', responsavel: '', dataOcorrencia: '', dataResolucao: '',
      impacto: '', causaRaiz: '', acoesCorrativas: '',
    };
  }

  private toDateInput(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  private toISO(value: string): string | null {
    if (!value) return null;
    return `${value}T00:00:00Z`;
  }

  private epoch(value: any): number {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const d = new Date(value);
    return isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime();
  }
}
