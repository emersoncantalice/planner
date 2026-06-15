import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GanttPanelComponent } from '../gantt-panel/gantt-panel.component';

interface ReplanEvent {
  id: string;
  tipoAlteracao: string;
  scheduleItemTitulo: string;
  registradoEm: string | null;
  inicioAnterior: string | null;
  fimAnterior: string | null;
  inicioNovo: string | null;
  fimNovo: string | null;
}

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, GanttPanelComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss'
})
export class ProjectDetailComponent implements OnChanges {
  @Input() projeto: any = null;
  @Input() perfis: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() usuariosSistema: string[] = [];
  @Input() token = '';
  @Input() currentUser = '';
  @Input() openTransferRequestId = 0;
  @Output() addScheduleItem    = new EventEmitter<{ titulo: string; descricao: string; inicioPlanejado: string | null; fimPlanejado: string | null; permiteParalelo: boolean }>();
  @Output() updateScheduleItem = new EventEmitter<{ itemId: string; titulo?: string; descricao?: string; inicioPlanejado?: string | null; fimPlanejado?: string | null; permiteParalelo?: boolean; status?: string }>();
  @Output() deleteScheduleItem = new EventEmitter<string>();
  @Output() reorderSchedule    = new EventEmitter<string[]>();
  @Output() logReplanejamento  = new EventEmitter<{
    scheduleItemId: string;
    scheduleItemTitulo: string;
    tipoAlteracao: string;
    inicioAnterior: string;
    fimAnterior: string;
    inicioNovo: string;
    fimNovo: string;
  }>();
  @Output() transferOwnership = new EventEmitter<{ id: string; novoDono: string }>();

  donoModalAberto = false;
  donoNovoInput   = '';
  cronogramaTelaCheia = false;
  cronogramaColapsado = false;

  toggleCronograma() { this.cronogramaColapsado = !this.cronogramaColapsado; }

  isDonoDoProjeto(): boolean {
    const role = (localStorage.getItem('planner_role') || '').trim();
    if (role === 'ADMIN') return true;
    if (!this.projeto?.donoProjeto) return true;
    return this.projeto.donoProjeto.toLowerCase() === (this.currentUser || '').toLowerCase();
  }

  abrirDonoModal()  { this.donoNovoInput = ''; this.donoModalAberto = true; }
  fecharDonoModal() { this.donoModalAberto = false; this.donoNovoInput = ''; }
  selecionarNovoDono(username: string) { this.donoNovoInput = username; }
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'F11') {
      event.preventDefault();
      this.toggleCronogramaTelaCheia();
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    if (!document.fullscreenElement) {
      this.cronogramaTelaCheia = false;
    }
  }

  toggleCronogramaTelaCheia() {
    this.cronogramaTelaCheia = !this.cronogramaTelaCheia;
    if (this.cronogramaTelaCheia) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }

  usuariosSugeridos(): string[] {
    const base = (this.usuariosSistema || []).filter(Boolean);
    const q = (this.donoNovoInput || '').trim().toLowerCase();
    if (!q) return base;
    return base.filter(u => u.toLowerCase().includes(q));
  }

  confirmarTransferenciaProjeto() {
    if (!this.donoNovoInput.trim() || !this.projeto?.id) return;
    this.transferOwnership.emit({ id: this.projeto.id, novoDono: this.donoNovoInput.trim() });
    this.fecharDonoModal();
  }

  visibleReplanCount = 5;
  // Histórico de Replanejamento começa sempre retraído.
  replanCollapsed = true;

  toggleReplanHistorico() { this.replanCollapsed = !this.replanCollapsed; }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projeto']) { this.visibleReplanCount = 5; this.replanCollapsed = true; this.cronogramaColapsado = false; }
    if (changes['openTransferRequestId'] && this.openTransferRequestId > 0 && this.isDonoDoProjeto()) {
      this.abrirDonoModal();
    }
  }

  historicoReplanejamento(): ReplanEvent[] {
    const list = this.projeto?.historicoReplanejamento;
    return Array.isArray(list) ? (list as ReplanEvent[]) : [];
  }

  historicoVisivel(): ReplanEvent[] {
    return this.historicoReplanejamento()
      .slice()
      .sort((a, b) => {
        const ta = a?.registradoEm ? new Date(a.registradoEm).getTime() : 0;
        const tb = b?.registradoEm ? new Date(b.registradoEm).getTime() : 0;
        return tb - ta;
      })
      .slice(0, this.visibleReplanCount);
  }

  tipoLabel(tipo: string): string {
    return ({
      MOVER:               'Movido',
      REDIMENSIONAR_INICIO: 'Início ajustado',
      REDIMENSIONAR_FIM:   'Fim ajustado',
      REDIMENSIONAR:       'Redimensionado',
    } as any)[tipo] ?? tipo;
  }

  fmtD(d: string | null): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isFinite(dt.getTime()) ? dt.toLocaleDateString('pt-BR') : '—';
  }

  fmtDt(d: string | null): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (!isFinite(dt.getTime())) return '—';
    return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
}
