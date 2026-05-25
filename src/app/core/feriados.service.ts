/**
 * FeriadosService — manages custom holidays and working-day configuration.
 *
 * Persists to localStorage:
 *   'planner_feriados'         – custom (user-defined) holidays
 *   'planner_feriados_federal' – overrides on federal holidays (rename / disable)
 *   'planner_dias_uteis'       – which weekdays are business days
 */
import { Injectable, signal } from '@angular/core';
import { dateToYmd } from './business-days';

export interface FeriadoCustom {
  id: string;
  data: string;   // 'YYYY-MM-DD'
  nome: string;
  tipo: 'municipal' | 'estadual' | 'facultativo' | 'outro';
}

export interface FederalOverride {
  nomeCustom?: string;  // if set, replaces the default name in the UI
  disabled: boolean;    // if true, that date is treated as a normal working day
}

/** Which days of the week are business days (0=Sun … 6=Sat). Default: 1–5. */
export type DiasUteisConfig = boolean[];

const KEY_FERIADOS         = 'planner_feriados';
const KEY_FEDERAL_OVERRIDE = 'planner_feriados_federal';
const KEY_DIAS_UTEIS       = 'planner_dias_uteis';

const DEFAULT_DIAS_UTEIS: DiasUteisConfig = [false, true, true, true, true, true, false];

// ── Easter (Meeus/Jones/Butcher) ─────────────────────────────────────────────
function calcEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}
function shiftDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

/** Raw federal holidays for a year (date + original name). */
export function federalHolidaysForYear(year: number): { data: string; nome: string }[] {
  const e = calcEaster(year);
  return [
    { data: `${year}-01-01`, nome: 'Ano Novo' },
    { data: dateToYmd(shiftDays(e, -48)), nome: 'Carnaval (2ª feira)' },
    { data: dateToYmd(shiftDays(e, -47)), nome: 'Carnaval (3ª feira)' },
    { data: dateToYmd(shiftDays(e,  -2)), nome: 'Sexta-feira Santa' },
    { data: `${year}-04-21`, nome: 'Tiradentes' },
    { data: `${year}-05-01`, nome: 'Dia do Trabalho' },
    { data: dateToYmd(shiftDays(e,  60)), nome: 'Corpus Christi' },
    { data: `${year}-09-07`, nome: 'Independência do Brasil' },
    { data: `${year}-10-12`, nome: 'Nossa Senhora Aparecida' },
    { data: `${year}-11-02`, nome: 'Finados' },
    { data: `${year}-11-15`, nome: 'Proclamação da República' },
    { data: `${year}-11-20`, nome: 'Consciência Negra' },
    { data: `${year}-12-25`, nome: 'Natal' },
  ];
}

@Injectable({ providedIn: 'root' })
export class FeriadosService {
  // ── Signals ────────────────────────────────────────────────────────────────
  feriados        = signal<FeriadoCustom[]>(this._loadFeriados());
  diasUteis       = signal<DiasUteisConfig>(this._loadDiasUteis());
  federalOverrides = signal<Record<string, FederalOverride>>(this._loadFederalOverrides());

  // ── Persistence ───────────────────────────────────────────────────────────
  private _loadFeriados(): FeriadoCustom[] {
    try { return JSON.parse(localStorage.getItem(KEY_FERIADOS) ?? '[]'); }
    catch { return []; }
  }

  private _loadDiasUteis(): DiasUteisConfig {
    try {
      const raw = localStorage.getItem(KEY_DIAS_UTEIS);
      if (!raw) return [...DEFAULT_DIAS_UTEIS];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length === 7 ? parsed : [...DEFAULT_DIAS_UTEIS];
    } catch { return [...DEFAULT_DIAS_UTEIS]; }
  }

  private _loadFederalOverrides(): Record<string, FederalOverride> {
    try { return JSON.parse(localStorage.getItem(KEY_FEDERAL_OVERRIDE) ?? '{}'); }
    catch { return {}; }
  }

  private _saveFeriados()         { localStorage.setItem(KEY_FERIADOS, JSON.stringify(this.feriados())); }
  private _saveDiasUteis()        { localStorage.setItem(KEY_DIAS_UTEIS, JSON.stringify(this.diasUteis())); }
  private _saveFederalOverrides() { localStorage.setItem(KEY_FEDERAL_OVERRIDE, JSON.stringify(this.federalOverrides())); }

  // ── Custom holiday CRUD ───────────────────────────────────────────────────
  addFeriado(f: Omit<FeriadoCustom, 'id'>): void {
    this.feriados.update(list => [...list, { ...f, id: crypto.randomUUID() }]);
    this._saveFeriados();
  }

  updateFeriado(id: string, f: Partial<Omit<FeriadoCustom, 'id'>>): void {
    this.feriados.update(list => list.map(item => item.id === id ? { ...item, ...f } : item));
    this._saveFeriados();
  }

  removeFeriado(id: string): void {
    this.feriados.update(list => list.filter(item => item.id !== id));
    this._saveFeriados();
  }

  // ── Federal override CRUD ─────────────────────────────────────────────────

  /** Rename a federal holiday (or leave nomeCustom undefined to keep default name). */
  renameFederal(data: string, nomeCustom: string): void {
    this.federalOverrides.update(map => ({
      ...map,
      [data]: { ...map[data], nomeCustom, disabled: map[data]?.disabled ?? false }
    }));
    this._saveFederalOverrides();
  }

  /** Mark a federal holiday as disabled (treated as a working day). */
  disableFederal(data: string): void {
    this.federalOverrides.update(map => ({
      ...map,
      [data]: { ...map[data], disabled: true }
    }));
    this._saveFederalOverrides();
  }

  /** Restore a federal holiday to its default state (remove all overrides). */
  restoreFederal(data: string): void {
    this.federalOverrides.update(map => {
      const next = { ...map };
      delete next[data];
      return next;
    });
    this._saveFederalOverrides();
  }

  isFederalDisabled(data: string): boolean {
    return this.federalOverrides()[data]?.disabled === true;
  }

  getFederalName(data: string, defaultName: string): string {
    return this.federalOverrides()[data]?.nomeCustom || defaultName;
  }

  // ── Working-day config ────────────────────────────────────────────────────
  setDiasUteis(config: DiasUteisConfig): void {
    this.diasUteis.set([...config]);
    this._saveDiasUteis();
  }

  toggleDiaUtil(dow: number): void {
    this.diasUteis.update(cfg => { const next = [...cfg]; next[dow] = !next[dow]; return next; });
    this._saveDiasUteis();
  }

  // ── Business-day queries ─────────────────────────────────────────────────

  private _customHolidaySet(): Set<string> {
    return new Set(this.feriados().map(f => f.data));
  }

  /** Active (non-disabled) federal holidays for a year. */
  private _activeFederalSet(year: number): Set<string> {
    const overrides = this.federalOverrides();
    return new Set(
      federalHolidaysForYear(year)
        .filter(h => !overrides[h.data]?.disabled)
        .map(h => h.data)
    );
  }

  isBusinessDay(d: Date): boolean {
    const dow = d.getDay();
    if (!this.diasUteis()[dow]) return false;
    const ymd = dateToYmd(d);
    if (this._customHolidaySet().has(ymd)) return false;
    if (this._activeFederalSet(d.getFullYear()).has(ymd)) return false;
    return true;
  }

  nonWorkingReason(d: Date): string {
    const dow = d.getDay();
    const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    if (!this.diasUteis()[dow]) return names[dow];
    const ymd = dateToYmd(d);
    if (this._customHolidaySet().has(ymd)) return 'feriado';
    if (this._activeFederalSet(d.getFullYear()).has(ymd)) return 'feriado';
    return '';
  }

  /** Human-friendly non-working detail (includes holiday name when available). */
  nonWorkingDetail(d: Date): string {
    const dow = d.getDay();
    const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    if (!this.diasUteis()[dow]) return names[dow];

    const ymd = dateToYmd(d);
    const custom = this.feriados().find(f => f.data === ymd);
    if (custom) return `feriado: ${custom.nome}`;

    const fed = federalHolidaysForYear(d.getFullYear()).find(h => h.data === ymd);
    if (fed && !this.isFederalDisabled(ymd)) {
      return `feriado: ${this.getFederalName(ymd, fed.nome)}`;
    }

    return '';
  }

  nextBusinessDay(d: Date): Date {
    const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (!this.isBusinessDay(cur)) cur.setDate(cur.getDate() + 1);
    return cur;
  }

  nthBusinessDay(start: Date, n: number): Date {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    let count = 1;
    while (count < n) {
      cur.setDate(cur.getDate() + 1);
      if (this.isBusinessDay(cur)) count++;
    }
    return cur;
  }

  /** For Gantt visual bands: all non-working dates in [from, to]. */
  nonWorkingDatesInRange(from: Date, to: Date): { ymd: string; isHoliday: boolean }[] {
    const result: { ymd: string; isHoliday: boolean }[] = [];
    const customSet = this._customHolidaySet();
    const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (cur <= end) {
      const dow = cur.getDay();
      const ymd = dateToYmd(cur);
      if (!this.diasUteis()[dow]) {
        result.push({ ymd, isHoliday: false });
      } else {
        const fedSet = this._activeFederalSet(cur.getFullYear());
        if (customSet.has(ymd) || fedSet.has(ymd)) {
          result.push({ ymd, isHoliday: true });
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }
}
