import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-technical-debt-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './technical-debt-panel.component.html',
  styleUrl: './technical-debt-panel.component.scss'
})
export class TechnicalDebtPanelComponent {
  private toast = inject(ToastService);

  @Input() debitos: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() usuariosSistema: string[] = [];
  @Output() create     = new EventEmitter<any>();
  @Output() update     = new EventEmitter<any>();
  @Output() remove     = new EventEmitter<string>();
  @Output() importCsv  = new EventEmitter<File>();
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
  sortKey = 'prioridade';
  sortDir: 'asc' | 'desc' = 'desc';
  detalheId = '';
  historicoAberto = new Set<string>();

  form = this.emptyForm();

  // ── enums ──────────────────────────────────────────────────────────────────
  readonly categorias = [
    { value: 'ARQUITETURA',   label: 'Arquitetura' },
    { value: 'CODIGO',        label: 'Código' },
    { value: 'TESTES',        label: 'Testes' },
    { value: 'DOCUMENTACAO',  label: 'Documentação' },
    { value: 'INFRAESTRUTURA',label: 'Infraestrutura' },
    { value: 'SEGURANCA',     label: 'Segurança' },
    { value: 'OUTROS',        label: 'Outros' },
  ];

  readonly impactos = [
    { value: 'CRITICO', label: 'Crítico' },
    { value: 'ALTO',    label: 'Alto' },
    { value: 'MEDIO',   label: 'Médio' },
    { value: 'BAIXO',   label: 'Baixo' },
  ];

  readonly prioridades = [
    { value: 'URGENTE', label: 'Urgente' },
    { value: 'ALTA',    label: 'Alta' },
    { value: 'MEDIA',   label: 'Média' },
    { value: 'BAIXA',   label: 'Baixa' },
  ];

  readonly statusOpts = [
    { value: 'IDENTIFICADO',  label: 'Identificado' },
    { value: 'EM_TRATAMENTO', label: 'Em Tratamento' },
    { value: 'ACEITO',        label: 'Aceito (risco)' },
    { value: 'RESOLVIDO',     label: 'Resolvido' },
  ];

  
  toggleForm() {
    this.formExpanded = !this.formExpanded;
    if (this.formExpanded) { this.editingId = ''; this.form = this.emptyForm(); }
  }

  startEdit(d: any) {
    this.editingId = d.id;
    this.formExpanded = true;
    this.detalheId = '';
    this.form = {
      titulo:          d.titulo ?? '',
      descricao:       d.descricao ?? '',
      categoria:       d.categoria ?? 'CODIGO',
      impacto:         d.impacto ?? 'MEDIO',
      esforcoEstimado: d.esforcoEstimado ?? 0,
      prioridade:      d.prioridade ?? 'MEDIA',
      status:          d.status ?? 'IDENTIFICADO',
      responsavel:     d.responsavel ?? '',
      projetoRef:      d.projetoRef ?? '',
      dataAlvo:        this.toDateInput(d.dataAlvo),
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
      esforcoEstimado: Number(this.form.esforcoEstimado) || 0,
      dataAlvo: this.toISO(this.form.dataAlvo),
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

  onCsvSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this.importCsv.emit(file);
    input.value = '';
  }

  openCsvPicker(input: HTMLInputElement) {
    this.toast.showCsv({
      format: 'titulo,descricao,categoria,impacto,prioridade,esforcoEstimado,responsavel,projetoRef,dataAlvo',
      example: 'Login lento,Queries sem índice,CODIGO,ALTO,ALTA,16,João Silva,Projeto X,2026-08-01',
      onSelectFile: () => input.click(),
    });
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
    const prioOrder: Record<string, number> = { URGENTE: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 };
    const impOrder:  Record<string, number> = { CRITICO: 4, ALTO: 3, MEDIO: 2, BAIXO: 1 };
    return [...this.debitos]
      .filter(d => !q || `${d.titulo} ${d.categoria} ${d.status} ${d.responsavel} ${d.projetoRef}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (this.sortKey === 'prioridade') return ((prioOrder[a.prioridade] ?? 0) - (prioOrder[b.prioridade] ?? 0)) * dir;
        if (this.sortKey === 'impacto')    return ((impOrder[a.impacto] ?? 0)     - (impOrder[b.impacto] ?? 0))     * dir;
        if (this.sortKey === 'dataAlvo')   return (this.epoch(a.dataAlvo) - this.epoch(b.dataAlvo)) * dir;
        if (this.sortKey === 'esforcoEstimado') return ((a.esforcoEstimado ?? 0) - (b.esforcoEstimado ?? 0)) * dir;
        return String(a[this.sortKey] ?? '').localeCompare(String(b[this.sortKey] ?? ''), 'pt-BR', { sensitivity: 'base' }) * dir;
      });
  }

  
  categoriaLabel(c: string) { return this.categorias.find(x => x.value === c)?.label ?? c; }
  impactoLabel(i: string)   { return this.impactos.find(x => x.value === i)?.label ?? i; }
  prioridadeLabel(p: string){ return this.prioridades.find(x => x.value === p)?.label ?? p; }
  statusLabel(s: string)    { return this.statusOpts.find(x => x.value === s)?.label ?? s; }

  prioridadeBadge(p: string) {
    if (p === 'URGENTE') return 'badge-urgente';
    if (p === 'ALTA')    return 'badge-alta';
    if (p === 'MEDIA')   return 'badge-media';
    return 'badge-baixa';
  }

  impactoBadge(i: string) {
    if (i === 'CRITICO') return 'badge-critico';
    if (i === 'ALTO')    return 'badge-alto';
    if (i === 'MEDIO')   return 'badge-medio';
    return 'badge-baixo';
  }

  statusBadge(s: string) {
    if (s === 'RESOLVIDO')     return 'badge-resolvido';
    if (s === 'EM_TRATAMENTO') return 'badge-tratamento';
    if (s === 'ACEITO')        return 'badge-aceito';
    return 'badge-identificado';
  }

  formatDate(value: any) {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
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

  esforcoLabel(hours: number) {
    if (!hours) return '—';
    if (hours < 8) return `${hours}h`;
    const days = Math.round(hours / 8);
    return `${hours}h (~${days}d)`;
  }

  
  private emptyForm() {
    return {
      titulo: '', descricao: '', categoria: 'CODIGO', impacto: 'MEDIO',
      esforcoEstimado: 0, prioridade: 'MEDIA', status: 'IDENTIFICADO',
      responsavel: '', projetoRef: '', dataAlvo: '',
    };
  }

  private toDateInput(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  private toISO(value: string): string | null {
    return value ? `${value}T00:00:00Z` : null;
  }

  private epoch(value: any): number {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const d = new Date(value);
    return isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime();
  }
}
