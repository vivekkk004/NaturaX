import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDateTime, formatDeadline, formatDuration } from './format';
import { describeChange } from './auditFormat';
import { resolveApiBaseUrl, toApiError } from '../services/api';
import { cleanParams } from '../services/params';

describe('format helpers', () => {
  it('shows times in IST whatever the machine timezone', () => {
    // 09:00 UTC = 2:30 pm IST
    expect(formatDateTime('2026-10-20T09:00:00Z')).toMatch(/20 Oct 2026.*02:30\s?pm/i);
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatCurrency(150000)).toBe('₹1,50,000');
    expect(formatCurrency(null)).toBe('—');
  });

  it('describes deadlines relative to now', () => {
    const now = Date.parse('2026-10-20T10:00:00Z');
    expect(formatDeadline('2026-10-20T13:20:00Z', now)).toBe('in 3h 20m');
    expect(formatDeadline('2026-10-18T06:00:00Z', now)).toBe('overdue by 2d 4h');
    expect(formatDuration(45 * 60000)).toBe('45m');
  });
});

describe('describeChange (audit entries)', () => {
  it('summarises a reassignment with the deadline change', () => {
    const text = describeChange({
      action: 'REASSIGNED',
      oldValue: { name: 'Priya Sharma', deadline: '2026-10-18T06:00:00Z' },
      newValue: { name: 'Rahul Verma', deadline: '2026-10-21T06:00:00Z' },
    });
    expect(text).toMatch(/^Priya Sharma → Rahul Verma; deadline .+ → .+$/);
  });

  it('summarises a rule threshold change', () => {
    expect(
      describeChange({
        action: 'RULE_UPDATED',
        oldValue: { params: { thresholdHours: 24 } },
        newValue: { params: { thresholdHours: 12 } },
      }),
    ).toBe('thresholdHours: 24 → 12');
  });
});

describe('service helpers', () => {
  it('turns an axios error into a serialisable API error', () => {
    const error = {
      response: {
        status: 400,
        data: { error: { code: 'VALIDATION_ERROR', message: 'Bad', details: [1] } },
      },
    };
    expect(toApiError(error)).toEqual({
      message: 'Bad',
      code: 'VALIDATION_ERROR',
      status: 400,
      details: [1],
    });
    expect(toApiError({ request: {}, message: 'Network Error' }).message).toBe(
      'Cannot reach the server',
    );
  });

  it('accepts the API origin with or without /api', () => {
    expect(resolveApiBaseUrl('https://naturax.onrender.com')).toBe(
      'https://naturax.onrender.com/api',
    );
    expect(resolveApiBaseUrl('https://naturax.onrender.com/api/')).toBe(
      'https://naturax.onrender.com/api',
    );
    expect(resolveApiBaseUrl(undefined)).toBe('/api');
    expect(resolveApiBaseUrl('/api')).toBe('/api');
  });

  it('drops empty filters from query strings', () => {
    expect(cleanParams({ a: '', b: null, c: 0, d: 'x', e: false, f: true })).toEqual({
      c: 0,
      d: 'x',
      f: true,
    });
  });
});
