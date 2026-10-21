/**
 * Creates (or resets) the demo users. Idempotent: running it twice leaves exactly the same users.
 * Usage: npm run seed:users -w server
 */
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { ROLES } from '../src/constants/roles.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';

export const DEMO_PASSWORDS = { MANAGER: 'Manager@123', EMPLOYEE: 'Employee@123' };

export const DEMO_USERS = [
  { name: 'Meera Nair', email: 'manager@naturax.in', employeeCode: 'MGR001', role: ROLES.MANAGER },
  { name: 'Priya Sharma', email: 'priya@naturax.in', employeeCode: 'EMP001', role: ROLES.EMPLOYEE },
  { name: 'Rahul Verma', email: 'rahul@naturax.in', employeeCode: 'EMP002', role: ROLES.EMPLOYEE },
  {
    name: 'Anjali Menon',
    email: 'anjali@naturax.in',
    employeeCode: 'EMP003',
    role: ROLES.EMPLOYEE,
  },
  { name: 'Arjun Reddy', email: 'arjun@naturax.in', employeeCode: 'EMP004', role: ROLES.EMPLOYEE },
  { name: 'Sneha Patil', email: 'sneha@naturax.in', employeeCode: 'EMP005', role: ROLES.EMPLOYEE },
];

export async function seedUsers() {
  const hashes = {
    MANAGER: await hashPassword(DEMO_PASSWORDS.MANAGER),
    EMPLOYEE: await hashPassword(DEMO_PASSWORDS.EMPLOYEE),
  };

  // Upsert by email: creates missing users, resets existing ones to the documented demo state.
  await User.bulkWrite(
    DEMO_USERS.map((u) => ({
      updateOne: {
        filter: { email: u.email },
        update: { $set: { ...u, passwordHash: hashes[u.role], isActive: true } },
        upsert: true,
      },
    })),
  );
  return User.find({ email: { $in: DEMO_USERS.map((u) => u.email) } }).sort({ employeeCode: 1 });
}

// Run only when executed directly (not when imported by the full seed script).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await mongoose.connect(env.MONGODB_URI);
    await User.syncIndexes();
    const users = await seedUsers();
    console.table(
      users.map((u) => ({
        name: u.name,
        email: u.email,
        code: u.employeeCode,
        role: u.role,
        password: DEMO_PASSWORDS[u.role],
      })),
    );
  } catch (err) {
    console.error('Seeding users failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
