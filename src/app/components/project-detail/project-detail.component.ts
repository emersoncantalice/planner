import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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
  imports: [CommonModule, GanttPanelComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss'
})
export class ProjectDetailComponent implements OnChanges {
  @Input() projeto: any = null;
  @Input() perfis: any[] = [];
  @Input() pessoas: any[] = [];
  @Output() addScheduleItem    = new EventEmitter<{ titulo: string; descricao: string; inicioPlanejado: string | null; fimPlanejado: string | null; permiteParalelo: boolean }>();
  @Output() updateScheduleItem = new EventEmitter<{ itemId: string; titulo?: string; descricao?: string; inicioPlanejado?: string | null; fimPlanejado?: string | null; permiteParalelo?: boolean; status?: string }>();
  @Output() deleteScheduleItem = new EventEmitter<string>();
  @Output() logReplanejamento  = new EventEmitter<{
    scheduleItemId: string;
    scheduleItemTitulo: string;
    tipoAlteracao: string;
    inicioAnterior: string;
    fimAnterior: string;
    inicioNovo: string;
    fimNovo: string;
  }>();

  visibleReplanCount = 5;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projeto']) this.visibleReplanCount = 5;
  }

  historicoReplanejamento(): ReplanEvent[] {
    const list = this.projeto?.historicoReplanejamento;
    return Array.isArray(list) ? (list as ReplanEvent[]) : [];
  }

  historicoVisivel(): ReplanEvent[] {
    return this.historicoReplanejamento().slice(0, this.visibleReplanCount);
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
