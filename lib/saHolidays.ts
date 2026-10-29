// South African public holidays, worked out automatically for any year.
//
//  - The 12 holidays in the Public Holidays Act (Easter-based ones included).
//  - A holiday that falls on a SUNDAY also makes the following MONDAY a
//    public holiday (shown as "<name> (observed)"). Saturdays get no extra day.
//  - Extra one-off holidays the President declares (election days etc.) can't
//    be calculated, so they are listed in EXTRA_HOLIDAYS below. Add new ones
//    there when they are announced.

const EXTRA_HOLIDAYS: Record<string, string> = {
  '2019-05-08': 'General Elections',
  '2021-11-01': 'Local Government Elections',
  '2022-12-27': 'Public Holiday',
  '2024-05-29': 'General Elections',
  '2026-11-04': 'Local Government Elections',
};

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// Easter Sunday (Gregorian), returns [month 1-12, day]
function easterSunday(year: number): [number, number] {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function shift(year: number, month: number, day: number, days: number): string {
  const t = new Date(Date.UTC(year, month - 1, day + days));
  return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

const cache: Record<number, Record<string, string>> = {};

export function getSAHolidays(year: number): Record<string, string> {
  if (cache[year]) return cache[year];

  const [em, ed] = easterSunday(year);
  const fixed: [string, string][] = [
    [key(year, 1, 1), "New Year's Day"],
    [key(year, 3, 21), 'Human Rights Day'],
    [shift(year, em, ed, -2), 'Good Friday'],
    [shift(year, em, ed, 1), 'Family Day'],
    [key(year, 4, 27), 'Freedom Day'],
    [key(year, 5, 1), "Workers' Day"],
    [key(year, 6, 16), 'Youth Day'],
    [key(year, 8, 9), "National Women's Day"],
    [key(year, 9, 24), 'Heritage Day'],
    [key(year, 12, 16), 'Day of Reconciliation'],
    [key(year, 12, 25), 'Christmas Day'],
    [key(year, 12, 26), 'Day of Goodwill'],
  ];

  const out: Record<string, string> = {};
  fixed.forEach(([d, name]) => { out[d] = name; });

  // Sunday -> the Monday is a public holiday too (unless that Monday already is one)
  fixed.forEach(([d, name]) => {
    const [y, m, dd] = d.split('-').map(Number);
    if (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() === 0) {
      const monday = shift(y, m, dd, 1);
      if (!out[monday]) out[monday] = `${name} (observed)`;
    }
  });

  Object.entries(EXTRA_HOLIDAYS).forEach(([d, name]) => {
    if (d.startsWith(`${year}-`)) out[d] = name;
  });

  cache[year] = out;
  return out;
}

// 'yyyy-mm-dd' -> holiday name, or undefined
export function getHolidayName(dateStr: string): string | undefined {
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!year) return undefined;
  return getSAHolidays(year)[dateStr];
}
