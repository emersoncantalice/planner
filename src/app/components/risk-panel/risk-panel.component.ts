import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-risk-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './risk-panel.component.html',
  styleUrl: './risk-panel.component.scss'
})
export class RiskPanelComponent implements OnChanges {
  private toast = inject(ToastService);
  @Input() riscos: any[] = [];
  @Input() focoRiscoId = '';
  @Input() pessoas: any[] = [];
  @Output() create = new EventEmitter<{ titulo: string; descricao: string; planoAcao: string; status: string; dataFim: string | null; responsavel: string | null }>();
  @Output() update = new EventEmitter<{ id: string; titulo: string; descricao: string; planoAcao: string; status: string; dataFim: string | null; responsavel: string | null }>();
  @Output() updateStatus = new EventEmitter<{ riskId: string; status: string }>();
  @Output() postpone = new EventEmitter<{ riskId: string; novaDataFim: string; motivo: string }>();
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
    const nomes = this.pessoasAtivas()
      .map((p: any) => String(p?.nome || '').trim())
      .filter(Boolean);
    const base = Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const q = this.transferInput.trim().toLowerCase();
    if (!q) return base;
    return base.filter(n => n.toLowerCase().includes(q));
  }

  formExpanded = false;
  editingId = '';
  adiarRiskId = '';
  risco = { titulo: '', descricao: '', planoAcao: '', status: 'PLANO_ACAO', dataFim: null as string | null, responsavel: null as string | null };
  adiamento = { novaDataFim: '', motivo: '' };
  searchTerm = '';
  sortKey: 'titulo' | 'status' | 'descricao' | 'planoAcao' | 'dataFim' = 'dataFim';
  sortDirection: 'asc' | 'desc' = 'asc';
  historicoAberto = new Set<string>();
  ngOnChanges(changes: SimpleChanges) {
    if (!changes['focoRiscoId']) return;
    const riskId = String(this.focoRiscoId || '').trim();
    if (!riskId) return;
    const risco = this.riscos.find((r: any) => r?.id === riskId);
    if (!risco) return;
    this.startEdit(risco);
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
      format: 'titulo,descricao,planoAcao,status,dataFim',
      example: 'Atraso no fornecedor,Risco de entrega atrasada,Acionar backup,PLANO_ACAO,2026-06-30',
      onSelectFile: () => input.click()
    });
  }

  toggleForm() {
    this.formExpanded = !this.formExpanded;
  }

  submit() {
    this.create.emit(this.risco);
  }

  nextStatus(current: string): string {
    const flow = ['PLANO_ACAO', 'DESENVOLVIMENTO', 'ENTREGA', 'CONCLUIDO'];
    const idx = flow.indexOf((current || '').toUpperCase());
    if (idx < 0 || idx >= flow.length - 1) return 'CONCLUIDO';
    return flow[idx + 1];
  }

  startEdit(r: any) {
    this.editingId = r.id;
    this.risco = {
      titulo: r.titulo,
      descricao: r.descricao,
      planoAcao: r.planoAcao ?? '',
      status: r.status,
      dataFim: r.dataFim ? String(r.dataFim).substring(0, 10) : null,
      responsavel: r.responsavel ?? null
    };
    this.formExpanded = true;
    setTimeout(() => document.getElementById('risco-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  pessoasAtivas() {
    return this.pessoas.filter((p: any) => p.ativo !== false);
  }

  saveEdit() {
    if (!this.editingId) return;
    this.update.emit({ id: this.editingId, ...this.risco });
    this.editingId = '';
    this.formExpanded = false;
  }

  cancelEdit() {
    this.editingId = '';
    this.formExpanded = false;
  }

  toggleHistorico(riskId: string) {
    if (this.historicoAberto.has(riskId)) {
      this.historicoAberto.delete(riskId);
      return;
    }
    this.historicoAberto.add(riskId);
  }

  abrirAdiamento(riskId: string) {
    this.adiarRiskId = riskId;
    this.adiamento = { novaDataFim: '', motivo: '' };
  }

  cancelarAdiamento() {
    this.adiarRiskId = '';
    this.adiamento = { novaDataFim: '', motivo: '' };
  }

  confirmarAdiamento() {
    if (!this.adiarRiskId || !this.adiamento.novaDataFim || !this.adiamento.motivo.trim()) return;
    this.postpone.emit({
      riskId: this.adiarRiskId,
      novaDataFim: this.adiamento.novaDataFim,
      motivo: this.adiamento.motivo.trim()
    });
    this.cancelarAdiamento();
  }

  toggleSort(key: 'titulo' | 'status' | 'descricao' | 'planoAcao' | 'dataFim') {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDirection = 'asc';
  }

  sortedRiscos() {
    const query = this.searchTerm.trim().toLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.riscos]
      .filter((r: any) => {
        if (!query) return true;
        return `${r?.titulo ?? ''} ${r?.status ?? ''} ${r?.descricao ?? ''} ${r?.planoAcao ?? ''} ${r?.dataFim ?? ''}`.toLowerCase().includes(query);
      })
      .sort((a: any, b: any) => this.compareBySort(a, b) * direction);
  }

  sortIndicator(key: 'titulo' | 'status' | 'descricao' | 'planoAcao' | 'dataFim') {
    if (this.sortKey !== key) return '';
    return this.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
  }

  statusClass(status: string) {
    const key = (status || '').toUpperCase();
    if (key === 'CONCLUIDO') return 'badge-concluido';
    if (key === 'ENTREGA') return 'badge-entrega';
    if (key === 'DESENVOLVIMENTO') return 'badge-dev';
    return 'badge-plano';
  }

  vencimentoClass(risco: any) {
    const days = this.daysUntil(risco?.dataFim);
    if (days == null) return 'due-unknown';
    if ((risco?.status || '').toUpperCase() === 'CONCLUIDO') return 'due-ok';
    if (days < 0) return 'due-overdue';
    if (days <= 3) return 'due-critical';
    if (days <= 7) return 'due-warning';
    return 'due-ok';
  }

  diasParaVencer(risco: any) {
    if ((risco?.status || '').toUpperCase() === 'CONCLUIDO') return '-';
    const days = this.daysUntil(risco?.dataFim);
    if (days == null) return '-';
    if (days < 0) return `${Math.abs(days)} dia(s) em atraso`;
    if (days === 0) return 'vence hoje';
    return `${days} dia(s)`;
  }

  historySorted(risco: any) {
    const h = Array.isArray(risco?.historico) ? [...risco.historico] : [];
    return h.sort((a: any, b: any) => String(b?.criadoEm ?? '').localeCompare(String(a?.criadoEm ?? '')));
  }

  private compareBySort(a: any, b: any) {
    if (this.sortKey === 'dataFim') {
      const at = this.toEpoch(a?.dataFim);
      const bt = this.toEpoch(b?.dataFim);
      return at - bt;
    }
    return String(a?.[this.sortKey] ?? '').localeCompare(String(b?.[this.sortKey] ?? ''), 'pt-BR', { sensitivity: 'base' });
  }

  private toEpoch(value: string | null | undefined) {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime();
  }

  private daysUntil(value: string | null | undefined): number | null {
    if (!value) return null;
    const target = new Date(value);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffMs = startTarget.getTime() - startToday.getTime();
    return Math.floor(diffMs / 86400000);
  }
}


