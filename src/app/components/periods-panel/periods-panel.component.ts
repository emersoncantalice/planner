import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';
import { PlannerApiService } from '../../core/planner-api.service';

type PeriodType = 'DIARIO' | 'SEMANAL' | 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

interface PeriodRecord {
  id: string; titulo: string; descricao: string; tipo: PeriodType | string;
  diaInicio: number; diaFim: number; mesInicio?: number; mesFim?: number;
  cor: string; icone: string; criadoPor?: string;
}

interface UpcomingPeriod {
  period: PeriodRecord;
  start: Date;
  end: Date;
}

@Component({
  selector: 'app-periods-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectDirective],
  templateUrl: './periods-panel.component.html',
  styleUrl: './periods-panel.component.scss'
})
export class PeriodsPanelComponent implements OnChanges {
  @Input() token = '';
  @Output() changed = new EventEmitter<void>();

  private api = inject(PlannerApiService);
  private cdr = inject(ChangeDetectorRef);

  periods: PeriodRecord[] = [];
  showForm = false;
  editingId: string | null = null;

  form = this.emptyForm();
  meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  diasSemana = ['Seg','Ter','Qua','Qui','Sex','Sab','Dom'];
  dias  = Array.from({ length: 31 }, (_, i) => i + 1);
  diasSemanaNums = Array.from({ length: 7 }, (_, i) => i + 1);
  tipos: { value: PeriodType; label: string }[] = [
    { value: 'DIARIO', label: 'Diario' },
    { value: 'SEMANAL', label: 'Semanal' },
    { value: 'MENSAL', label: 'Mensal' },
    { value: 'TRIMESTRAL', label: 'Trimestral' },
    { value: 'SEMESTRAL', label: 'Semestral' },
    { value: 'ANUAL', label: 'Anual' },
  ];

  readonly corPresets = ['#3b82f6','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#64748b'];

  isCorCustom(): boolean {
    return !!this.form.cor && !this.corPresets.includes(this.form.cor);
  }

  ngOnChanges(c: SimpleChanges) {
    if (c['token'] && this.token) this.load();
  }

  private emptyForm(): any {
    return {
      titulo: '', descricao: '', tipo: 'MENSAL',
      diaInicio: 1, diaFim: 1,
      mesInicio: 1, mesFim: 1,
      cor: '#3b82f6', icone: '📅'
    };
  }

  load() {
    this.api.listPeriods(this.token).subscribe({
      next: (list: any[]) => { this.periods = list || []; this.cdr.markForCheck(); }
    });
  }

  openCreate() {
    this.editingId = null;
    this.form      = this.emptyForm();
    this.showForm  = true;
  }

  openEdit(p: PeriodRecord) {
    this.editingId = p.id;
    this.form = {
      titulo: p.titulo, descricao: p.descricao, tipo: p.tipo,
      diaInicio: p.diaInicio, diaFim: p.diaFim,
      mesInicio: p.mesInicio ?? 1, mesFim: p.mesFim ?? 1,
      cor: p.cor, icone: p.icone
    };
    this.normalizeFormForType();
    this.showForm = true;
  }

  save() {
    this.normalizeFormForType();
    const payload = {
      ...this.form,
      diaInicio: Number(this.form.diaInicio),
      diaFim: Number(this.form.diaFim),
      mesInicio: this.usesMonth(this.form.tipo) ? Number(this.form.mesInicio) : null,
      mesFim:    this.usesMonth(this.form.tipo) ? Number(this.form.mesFim)    : null,
    };
    const obs = this.editingId
      ? this.api.updatePeriod(this.token, this.editingId, payload)
      : this.api.createPeriod(this.token, payload);
    obs.subscribe({
      next: () => { this.showForm = false; this.changed.emit(); this.load(); },
      error: (err: any) => alert(err?.error?.error || 'Erro ao salvar.')
    });
  }

  delete(id: string) {
    if (!confirm('Confirma a exclusao deste periodo?')) return;
    this.api.deletePeriod(this.token, id).subscribe({ next: () => { this.changed.emit(); this.load(); } });
  }

  mesLabel(m: number | undefined): string {
    if (m == null) return '';
    return this.meses[(m - 1) % 12] ?? '';
  }

  diaSemanaLabel(d: number | undefined): string {
    if (d == null) return '';
    return this.diasSemana[(d - 1) % 7] ?? '';
  }

  tipoLabel(tipo: string): string {
    return this.tipos.find(t => t.value === tipo)?.label ?? tipo;
  }

  periodoLabel(p: PeriodRecord): string {
    if (p.tipo === 'DIARIO') return 'Todos os dias';
    if (p.tipo === 'SEMANAL') return `${this.diaSemanaLabel(p.diaInicio)} - ${this.diaSemanaLabel(p.diaFim)} toda semana`;
    if (p.tipo === 'MENSAL') return `Dias ${p.diaInicio}-${p.diaFim} de cada mes`;
    if (p.tipo === 'TRIMESTRAL') return `A cada 3 meses, de ${this.mesLabel(p.mesInicio)}/${p.diaInicio} a ${this.mesLabel(p.mesFim)}/${p.diaFim}`;
    if (p.tipo === 'SEMESTRAL') return `A cada 6 meses, de ${this.mesLabel(p.mesInicio)}/${p.diaInicio} a ${this.mesLabel(p.mesFim)}/${p.diaFim}`;
    return `${this.mesLabel(p.mesInicio)}/${p.diaInicio} - ${this.mesLabel(p.mesFim)}/${p.diaFim}`;
  }

  upcomingPeriods(): UpcomingPeriod[] {
    const today = this.startOfDay(new Date());
    return this.periods
      .flatMap(period => this.nextOccurrences(period, today, 3))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 8);
  }

  upcomingDateLabel(item: UpcomingPeriod): string {
    const start = this.formatDate(item.start);
    const end = this.formatDate(item.end);
    return start === end ? start : `${start} - ${end}`;
  }

  daysUntil(item: UpcomingPeriod): string {
    const today = this.startOfDay(new Date());
    const diff = Math.round((this.startOfDay(item.start).getTime() - today.getTime()) / 86400000);
    if (diff <= 0) return 'Hoje';
    if (diff === 1) return 'Amanha';
    return `Em ${diff} dias`;
  }

  usesMonth(tipo: string): boolean {
    return tipo === 'ANUAL' || tipo === 'TRIMESTRAL' || tipo === 'SEMESTRAL';
  }

  usesDayOfMonth(tipo: string): boolean {
    return tipo === 'MENSAL' || this.usesMonth(tipo);
  }

  onTipoChange() {
    this.normalizeFormForType();
  }

  private normalizeFormForType() {
    if (this.form.tipo === 'DIARIO') {
      this.form.diaInicio = 1;
      this.form.diaFim = 1;
      this.form.mesInicio = 1;
      this.form.mesFim = 1;
      return;
    }
    if (this.form.tipo === 'SEMANAL') {
      this.form.diaInicio = Math.min(Number(this.form.diaInicio) || 1, 7);
      this.form.diaFim = Math.min(Number(this.form.diaFim) || this.form.diaInicio, 7);
      this.form.mesInicio = 1;
      this.form.mesFim = 1;
      return;
    }
    this.form.diaInicio = Number(this.form.diaInicio) || 1;
    this.form.diaFim = Number(this.form.diaFim) || this.form.diaInicio;
    this.form.mesInicio = Number(this.form.mesInicio) || 1;
    this.form.mesFim = Number(this.form.mesFim) || this.form.mesInicio;
  }

  private nextOccurrences(period: PeriodRecord, today: Date, limit: number): UpcomingPeriod[] {
    const occurrences: UpcomingPeriod[] = [];
    const horizon = new Date(today);
    horizon.setFullYear(horizon.getFullYear() + 2);
    const cursor = new Date(today);

    while (cursor <= horizon && occurrences.length < limit) {
      const occurrence = this.occurrenceForDate(period, cursor);
      if (occurrence && occurrence.end >= today && !occurrences.some(o => this.sameDay(o.start, occurrence.start) && o.period.id === period.id)) {
        occurrences.push(occurrence);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return occurrences;
  }

  private occurrenceForDate(period: PeriodRecord, date: Date): UpcomingPeriod | null {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    if (period.tipo === 'DIARIO') {
      const start = this.startOfDay(date);
      return { period, start, end: start };
    }

    if (period.tipo === 'SEMANAL') {
      const weekStart = this.addDays(this.startOfDay(date), -(this.isoWeekday(date) - 1));
      const start = this.addDays(weekStart, (period.diaInicio || 1) - 1);
      const end = this.addDays(weekStart, (period.diaFim || period.diaInicio || 1) - 1);
      if (date <= end) return { period, start, end };
      return null;
    }

    if (period.tipo === 'MENSAL') {
      const start = this.safeDate(year, month, period.diaInicio);
      const end = this.safeDate(year, month, period.diaFim);
      if (date <= end) return { period, start, end };
      return null;
    }

    if (period.tipo === 'TRIMESTRAL' || period.tipo === 'SEMESTRAL') {
      const step = period.tipo === 'TRIMESTRAL' ? 3 : 6;
      const startMonth = period.mesInicio ?? 1;
      if (((month - startMonth + 12) % step) !== 0) return null;
      const endMonth = period.mesFim ?? startMonth;
      const start = this.safeDate(year, month, period.diaInicio);
      const monthDelta = (endMonth - startMonth + 12) % step;
      const endBase = new Date(year, month - 1 + monthDelta, 1);
      const end = this.safeDate(endBase.getFullYear(), endBase.getMonth() + 1, period.diaFim);
      if (date <= end) return { period, start, end };
      return null;
    }

    if (period.mesInicio == null || period.mesFim == null) return null;
    const start = this.safeDate(year, period.mesInicio, period.diaInicio);
    const endYear = period.mesFim < period.mesInicio ? year + 1 : year;
    const end = this.safeDate(endYear, period.mesFim, period.diaFim);
    if (date <= end) return { period, start, end };
    return null;
  }

  private isoWeekday(date: Date): number {
    const day = date.getDay();
    return day === 0 ? 7 : day;
  }

  private addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private safeDate(year: number, month: number, day: number): Date {
    return new Date(year, month - 1, Math.min(day, new Date(year, month, 0).getDate()));
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
