import { describe, it, expect, vi } from 'vitest';
import { authorize } from '../../src/middleware/auth.js';
import { ForbiddenError, UnauthorizedError } from '../../src/errors/index.js';

function run(user, ...roles) {
  const next = vi.fn();
  authorize(...roles)({ user }, {}, next);
  return next.mock.calls[0][0];
}

describe('authorize (RBAC) middleware', () => {
  it('lets an allowed role through', () => {
    expect(run({ role: 'MANAGER' }, 'MANAGER')).toBeUndefined();
  });

  it('accepts any of several allowed roles', () => {
    expect(run({ role: 'EMPLOYEE' }, 'MANAGER', 'EMPLOYEE')).toBeUndefined();
  });

  it('returns 403 for an authenticated user with the wrong role', () => {
    expect(run({ role: 'EMPLOYEE' }, 'MANAGER')).toBeInstanceOf(ForbiddenError);
  });

  it('returns 401 when authenticate did not run / no user', () => {
    expect(run(undefined, 'MANAGER')).toBeInstanceOf(UnauthorizedError);
  });
});
