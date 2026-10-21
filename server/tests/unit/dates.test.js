import { describe, it, expect } from 'vitest';
import { endOfIstDay, formatIst, istDayKey, parseDateValue } from '../../src/utils/dates.js';

const iso = (text) => parseDateValue(text)?.date.toISOString() ?? null;

describe('parseDateValue (IST)', () => {
  it('reads day-first Indian formats as IST and converts to UTC', () => {
    // 20-10-2026 14:30 IST == 09:00 UTC
    expect(iso('20-10-2026 14:30')).toBe('2026-10-20T09:00:00.000Z');
    expect(iso('20/10/2026 14:30')).toBe('2026-10-20T09:00:00.000Z');
    expect(iso('20.10.2026 2:30 PM')).toBe('2026-10-20T09:00:00.000Z');
    expect(iso('20-Oct-2026 14:30')).toBe('2026-10-20T09:00:00.000Z');
  });

  it('reads ISO dates, honouring an explicit offset', () => {
    expect(iso('2026-10-20T14:30')).toBe('2026-10-20T09:00:00.000Z');
    expect(iso('2026-10-20 14:30:00')).toBe('2026-10-20T09:00:00.000Z');
    expect(iso('2026-10-20T09:00:00Z')).toBe('2026-10-20T09:00:00.000Z');
    expect(iso('2026-10-20T14:30:00+05:30')).toBe('2026-10-20T09:00:00.000Z');
  });

  it('flags whether a time was given', () => {
    expect(parseDateValue('20-10-2026').hasTime).toBe(false);
    expect(parseDateValue('20-10-2026 00:00').hasTime).toBe(true);
  });

  it('rejects impossible or malformed dates', () => {
    for (const bad of [
      '31-02-2026',
      '2026-13-01',
      '32-01-2026',
      '20-10-2026 25:00',
      'yesterday',
      '10/20',
      '1899-01-01',
    ]) {
      expect(parseDateValue(bad), bad).toBeNull();
    }
  });

  it('accepts leap days only in leap years', () => {
    expect(parseDateValue('29-02-2028')).not.toBeNull();
    expect(parseDateValue('29-02-2026')).toBeNull();
  });

  it('reads Excel dates and serial numbers as IST wall-clock time', () => {
    // ExcelJS gives a Date whose UTC fields hold the typed wall clock
    expect(parseDateValue(new Date(Date.UTC(2026, 9, 20, 14, 30))).date.toISOString()).toBe(
      '2026-10-20T09:00:00.000Z',
    );
    // 46315 = 20-10-2026 in Excel's serial date system
    expect(istDayKey(parseDateValue(46315).date)).toBe('2026-10-20');
  });

  it('computes IST day boundaries and formats in IST', () => {
    const d = parseDateValue('20-10-2026 02:00').date; // 19-10 20:30 UTC, but 20-10 in India
    expect(istDayKey(d)).toBe('2026-10-20');
    expect(endOfIstDay(d).toISOString()).toBe('2026-10-20T18:29:59.999Z');
    expect(formatIst(d)).toBe('20-10-2026 02:00');
  });
});
