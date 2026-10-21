/**
 * MANAGER is the admin-level role: imports files, edits rules, reassigns tasks, manages users.
 * EMPLOYEE works only on the tasks assigned to them.
 */
export const ROLES = Object.freeze({
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
});

export const ROLE_VALUES = Object.values(ROLES);
