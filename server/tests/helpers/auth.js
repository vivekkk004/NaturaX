import request from 'supertest';
import { User } from '../../src/models/User.js';
import { ROLES } from '../../src/constants/roles.js';
import { hashPassword } from '../../src/modules/auth/auth.service.js';

export const TEST_PASSWORD = 'Password123';

let counter = 0;

export async function createUser(overrides = {}) {
  counter += 1;
  return User.create({
    name: `User ${counter}`,
    email: `user${counter}@test.in`,
    employeeCode: `EMP${String(counter).padStart(3, '0')}`,
    role: ROLES.EMPLOYEE,
    passwordHash: await hashPassword(overrides.password ?? TEST_PASSWORD),
    ...overrides,
  });
}

/** Creates a user and logs in through the real endpoint; returns the user, token and cookie. */
export async function loginAs(app, role = ROLES.EMPLOYEE, overrides = {}) {
  const user = await createUser({ role, ...overrides });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: TEST_PASSWORD });
  return {
    user,
    token: res.body.data.accessToken,
    cookie: res.headers['set-cookie'],
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
  };
}
