// Parse the date formats that appear in the seed into a half-open UTC range [start, end).
// A range keeps the original precision: "2023" covers the whole year, "Q3 2022" a quarter.
// Anything ambiguous (e.g. "1/9/24": Jan 9 or Sep 1? which century?) returns null — we never guess.

export interface DateRange {
  start: Date;
  end: Date; // exclusive
  precision: 'year' | 'quarter' | 'month' | 'day';
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d));

function dayRange(y: number, m: number, d: number): DateRange | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const start = utc(y, m, d);
  if (start.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return { start, end: utc(y, m, d + 1), precision: 'day' };
}

function monthRange(y: number, m: number): DateRange | null {
  if (m < 1 || m > 12) return null;
  return { start: utc(y, m), end: utc(y, m + 1), precision: 'month' };
}

export function parseDateRange(input: unknown): DateRange | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  let m: RegExpMatchArray | null;

  if ((m = value.match(/^(\d{4})$/))) {
    const y = Number(m[1]);
    return { start: utc(y, 1), end: utc(y + 1, 1), precision: 'year' };
  }
  if ((m = value.match(/^(\d{4})-(\d{2})$/))) return monthRange(Number(m[1]), Number(m[2]));
  if ((m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return dayRange(Number(m[1]), Number(m[2]), Number(m[3]));
  if ((m = value.match(/^Q([1-4])\s+(\d{4})$/i))) {
    const q = Number(m[1]);
    const y = Number(m[2]);
    return { start: utc(y, (q - 1) * 3 + 1), end: utc(y, q * 3 + 1), precision: 'quarter' };
  }
  if ((m = value.match(/^([A-Za-z]+)\s+(\d{4})$/))) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    return month === -1 ? null : monthRange(Number(m[2]), month + 1);
  }
  if ((m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    // Only accept when the order is provable: one part > 12 must be the day.
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (a > 12 && b <= 12) return dayRange(y, b, a); // DD/MM/YYYY
    if (b > 12 && a <= 12) return dayRange(y, a, b); // MM/DD/YYYY
    return null;
  }
  return null; // includes 2-digit years like "1/9/24"
}
