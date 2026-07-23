/**
 * Brazilian federal business-day utilities.
 *
 * Holidays included:
 *   Fixed:    Ano Novo, Tiradentes, Trabalho, Independência, Aparecida,
 *             Finados, Proclamação da República, Consciência Negra, Natal
 *   Variable: Carnaval 2ª e 3ª feira, Sexta-feira Santa, Corpus Christi
 *             (all derived from Easter via the Meeus/Jones/Butcher algorithm)
 */

/** Easter Sunday for a given year (Meeus/Jones/Butcher). */
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

export function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const _cache = new Map<number, Set<string>>();

function holidaysForYear(year: number): Set<string> {
  if (_cache.has(year)) return _cache.get(year)!;
  const e = calcEaster(year);
  const set = new Set<string>([
    // Fixed national holidays
    `${year}-01-01`, // Ano Novo
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-09-07`, // Independência do Brasil
    `${year}-10-12`, // Nossa Senhora Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra (lei federal desde 2024)
    `${year}-12-25`, // Natal
    // Variable holidays based on Easter
    dateToYmd(shiftDays(e, -48)), // Carnaval — 2ª feira
    dateToYmd(shiftDays(e, -47)), // Carnaval — 3ª feira
    dateToYmd(shiftDays(e,  -2)), // Sexta-feira Santa
    dateToYmd(shiftDays(e,  60)), // Corpus Christi
  ]);
  _cache.set(year, set);
  return set;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** True when d is a weekday and not a Brazilian federal holiday. */
export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !holidaysForYear(d.getFullYear()).has(dateToYmd(d));
}

/**
 * Why a date is non-working, or '' if it is a business day.
 * Values: 'domingo' | 'sábado' | 'feriado' | ''
 */
export function nonWorkingReason(d: Date): string {
  const dow = d.getDay();
  if (dow === 0) return 'domingo';
  if (dow === 6) return 'sábado';
  if (holidaysForYear(d.getFullYear()).has(dateToYmd(d))) return 'feriado';
  return '';
}

export function nextBusinessDay(d: Date): Date {
  const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (!isBusinessDay(cur)) cur.setDate(cur.getDate() + 1);
  return cur;
}

export function nthBusinessDay(start: Date, n: number): Date {
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let count = 1;
  while (count < n) {
    cur.setDate(cur.getDate() + 1);
    if (isBusinessDay(cur)) count++;
  }
  return cur;
}

// ── Ausências ───────────────────────────────────────────────────────────────

function normalizeNome(value: string): string {
  return (value || '').trim().toLowerCase();
}

/**
 * Conta os dias úteis (segunda a sexta) de ausência de uma pessoa dentro de um
 * mês/ano. Fins de semana são ignorados — é essa contagem que é debitada das
 * alocações de terceiros. Feriados NÃO são excluídos (regra de negócio atual).
 *
 * @param nomePessoa  nome da pessoa (casado por nome normalizado ou por id)
 * @param monthIndex  mês 0-based (0 = janeiro)
 * @param ano         ano de referência
 * @param pessoas     lista de pessoas (para resolver o id a partir do nome)
 * @param ausencias   lista de ausências registradas
 */
export function diasUteisAusenciaNoMes(
  nomePessoa: string,
  monthIndex: number,
  ano: number,
  pessoas: any[],
  ausencias: any[]
): number {
  const nomeNorm = normalizeNome(nomePessoa || '');
  if (!nomeNorm) return 0;
  const pessoa = (pessoas || []).find((p: any) => normalizeNome(p?.nome || '') === nomeNorm);
  const pessoaId = String(pessoa?.id || '').trim();
  const monthStart = new Date(ano, monthIndex, 1);
  const monthEnd = new Date(ano, monthIndex + 1, 0);
  const dias = new Set<string>();

  for (const a of (ausencias || [])) {
    const aid = String(a?.pessoaId || '').trim();
    const anome = normalizeNome(a?.pessoaNome || '');
    if (!(pessoaId && aid === pessoaId) && anome !== nomeNorm) continue;

    const inicioRaw = String(a?.inicio || '');
    const fimRaw = String(a?.fim || '');
    if (!inicioRaw || !fimRaw) continue;
    const inicio = new Date((a?.recorrente ? `${ano}-${inicioRaw.slice(5)}` : inicioRaw) + 'T00:00:00');
    const fim = new Date((a?.recorrente ? `${ano}-${fimRaw.slice(5)}` : fimRaw) + 'T00:00:00');
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) continue;

    const clampStart = inicio > monthStart ? inicio : monthStart;
    const clampEnd = fim < monthEnd ? fim : monthEnd;
    if (clampStart > clampEnd) continue;

    const cursor = new Date(clampStart.getTime());
    while (cursor <= clampEnd) {
      const dow = cursor.getDay();
      // Apenas dias úteis (segunda a sexta) contam como ausência debitável.
      if (dow !== 0 && dow !== 6) dias.add(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return dias.size;
}
