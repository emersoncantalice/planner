import { ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlannerApiService } from '../../core/planner-api.service';

interface PeriodRecord {
  id: string; titulo: string; descricao: string; tipo: string;
  diaInicio: number; diaFim: number; mesInicio?: number; mesFim?: number;
  cor: string; icone: string;
}

interface PeriodCheckRecord {
  periodId: string; username: string; ano: number; mes: number;
}

@Component({
  selector: 'app-period-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './period-banner.component.html',
  styleUrl: './period-banner.component.scss'
})
export class PeriodBannerComponent implements OnChanges {
  @Input() token    = '';
  @Input() username = '';
  @Input() refreshKey = 0;

  private api = inject(PlannerApiService);
  private cdr = inject(ChangeDetectorRef);

  periods: PeriodRecord[]      = [];
  checks:  PeriodCheckRecord[] = [];
  collapsed = false;

  ngOnChanges(c: SimpleChanges) {
    if ((c['token'] || c['username'] || c['refreshKey']) && this.token && this.username) this.load();
  }

  load() {
    this.api.listPeriods(this.token).subscribe({
      next: (list: any[]) => { this.periods = list || []; this.cdr.markForCheck(); }
    });
    this.api.listPeriodChecks(this.token).subscribe({
      next: (list: any[]) => { this.checks = list || []; this.cdr.markForCheck(); }
    });
  }

  activePeriods(): PeriodRecord[] {
    const today = this.startOfDay(new Date());
    return this.periods.filter(p => this.isActiveOn(p, today) && !this.isChecked(p));
  }

  isChecked(p: PeriodRecord): boolean {
    const today = new Date();
    const ano = today.getFullYear();
    const mes = this.checkKey(p, today);
    const me = this.username.toLowerCase();
    return this.checks.some(c =>
      c.periodId === p.id && c.username.toLowerCase() === me && c.ano === ano && c.mes === mes
    );
  }

  check(p: PeriodRecord) {
    const today = new Date();
    const ano = today.getFullYear();
    const mes = this.checkKey(p, today);
    this.api.checkPeriod(this.token, p.id, ano, mes).subscribe({
      next: (saved: PeriodCheckRecord) => {
        this.checks = [
          ...this.checks.filter(c => !(c.periodId === p.id && c.username.toLowerCase() === this.username.toLowerCase() && c.ano === ano && c.mes === mes)),
          saved || { periodId: p.id, username: this.username, ano, mes, checkedAt: '' } as any
        ];
        this.cdr.markForCheck();
      }
    });
  }

  uncheck(p: PeriodRecord) {
    const today = new Date();
    const ano = today.getFullYear();
    const mes = this.checkKey(p, today);
    this.api.uncheckPeriod(this.token, p.id, ano, mes).subscribe({
      next: () => {
        this.checks = this.checks.filter(c => !(c.periodId === p.id && c.username.toLowerCase() === this.username.toLowerCase() && c.ano === ano && c.mes === mes));
        this.cdr.markForCheck();
      }
    });
  }

  get hasActive(): boolean { return this.activePeriods().length > 0; }
  get uncheckedCount(): number { return this.activePeriods().length; }

  private isActiveOn(p: PeriodRecord, date: Date): boolean {
    const day = date.getDate();
    const month = date.getMonth() + 1;

    if (p.tipo === 'DIARIO') return true;

    if (p.tipo === 'SEMANAL') {
      const weekday = this.isoWeekday(date);
      return weekday >= p.diaInicio && weekday <= p.diaFim;
    }

    if (p.tipo === 'MENSAL') {
      return day >= p.diaInicio && day <= p.diaFim;
    }

    if (p.tipo === 'TRIMESTRAL' || p.tipo === 'SEMESTRAL') {
      const step = p.tipo === 'TRIMESTRAL' ? 3 : 6;
      const startMonth = p.mesInicio ?? 1;
      if (((month - startMonth + 12) % step) !== 0) return false;
      return day >= p.diaInicio && day <= p.diaFim;
    }

    if (p.mesInicio == null || p.mesFim == null) return false;
    const startM = p.mesInicio; const endM = p.mesFim;
    if (startM === endM) return month === startM && day >= p.diaInicio && day <= p.diaFim;
    if (startM < endM) {
      if (month < startM || month > endM) return false;
      if (month === startM) return day >= p.diaInicio;
      if (month === endM)   return day <= p.diaFim;
      return true;
    }
    if (month > startM || month < endM) return true;
    if (month === startM) return day >= p.diaInicio;
    if (month === endM)   return day <= p.diaFim;
    return false;
  }

  private checkKey(p: PeriodRecord, date: Date): number {
    if (p.tipo === 'DIARIO') return this.dateKey(date);
    if (p.tipo === 'SEMANAL') return this.weekKey(date);
    if (p.tipo === 'TRIMESTRAL' || p.tipo === 'SEMESTRAL' || p.tipo === 'ANUAL') return this.periodStartMonthKey(p, date);
    return date.getMonth();
  }

  private periodStartMonthKey(p: PeriodRecord, date: Date): number {
    const month = date.getMonth() + 1;
    if (p.tipo === 'ANUAL') return (p.mesInicio ?? month) - 1;
    const step = p.tipo === 'TRIMESTRAL' ? 3 : 6;
    const startMonth = p.mesInicio ?? 1;
    const offset = (month - startMonth + 12) % step;
    return month - 1 - offset;
  }

  private dateKey(date: Date): number {
    return (date.getMonth() + 1) * 100 + date.getDate();
  }

  private weekKey(date: Date): number {
    const start = this.addDays(this.startOfDay(date), -(this.isoWeekday(date) - 1));
    return (start.getMonth() + 1) * 100 + start.getDate();
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

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}
