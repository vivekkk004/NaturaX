import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ROLES } from '../../src/constants/roles.js';
import { useTestDatabase } from '../helpers/db.js';
import { createUser, loginAs } from '../helpers/auth.js';

useTestDatabase();
const app = createApp();

const newEmployee = {
  name: 'Kavya Iyer',
  email: 'kavya@naturax.in',
  employeeCode: 'emp100',
  password: 'Welcome123',
};

describe('RBAC on /api/users', () => {
  it('forbids employees (403) and unauthenticated callers (401)', async () => {
    const { auth } = await loginAs(app, ROLES.EMPLOYEE);

    expect((await request(app).get('/api/users').set(auth)).status).toBe(403);
    expect((await request(app).get('/api/users')).status).toBe(401);
  });
});

describe('manager user management', () => {
  it('creates a user, normalises the employee code and never returns the hash', async () => {
    const { auth } = await loginAs(app, ROLES.MANAGER);

    const res = await request(app).post('/api/users').set(auth).send(newEmployee);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      employeeCode: 'EMP100',
      role: 'EMPLOYEE',
      isActive: true,
    });
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('rejects duplicates with 409 and weak passwords with 400', async () => {
    const { auth } = await loginAs(app, ROLES.MANAGER);
    await request(app).post('/api/users').set(auth).send(newEmployee);

    const dup = await request(app)
      .post('/api/users')
      .set(auth)
      .send({ ...newEmployee, employeeCode: 'EMP101' });
    const weak = await request(app)
      .post('/api/users')
      .set(auth)
      .send({ ...newEmployee, email: 'x@naturax.in', employeeCode: 'EMP102', password: 'short' });

    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toEqual({ field: 'email' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details[0].field).toBe('password');
  });

  it('lists users with pagination, filtering and search', async () => {
    const { auth } = await loginAs(app, ROLES.MANAGER);
    await Promise.all([1, 2, 3].map(() => createUser()));
    await createUser({ name: 'Zoya Khan', isActive: false });

    const page1 = await request(app)
      .get('/api/users?role=EMPLOYEE&isActive=true&limit=2&page=1')
      .set(auth);
    const search = await request(app).get('/api/users?search=zoya').set(auth);
    const badSort = await request(app).get('/api/users?sort=passwordHash').set(auth);

    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(search.body.data.map((u) => u.name)).toEqual(['Zoya Khan']);
    expect(badSort.status).toBe(400);
  });

  it('deactivating a user ends their sessions immediately', async () => {
    const manager = await loginAs(app, ROLES.MANAGER);
    const employee = await loginAs(app, ROLES.EMPLOYEE);

    const res = await request(app)
      .patch(`/api/users/${employee.user.id}`)
      .set(manager.auth)
      .send({ isActive: false });
    expect(res.status).toBe(200);

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', employee.cookie);
    expect(refresh.status).toBe(401);
  });

  it('prevents a manager from deactivating or demoting themselves', async () => {
    const { user, auth } = await loginAs(app, ROLES.MANAGER);

    const deactivate = await request(app)
      .patch(`/api/users/${user.id}`)
      .set(auth)
      .send({ isActive: false });
    const demote = await request(app)
      .patch(`/api/users/${user.id}`)
      .set(auth)
      .send({ role: 'EMPLOYEE' });

    expect(deactivate.status).toBe(400);
    expect(demote.status).toBe(400);
  });

  it('returns 404 for an unknown id and 400 for a malformed id', async () => {
    const { auth } = await loginAs(app, ROLES.MANAGER);

    expect((await request(app).get('/api/users/507f1f77bcf86cd799439011').set(auth)).status).toBe(
      404,
    );
    expect((await request(app).get('/api/users/not-an-id').set(auth)).status).toBe(400);
  });
});
