import { ROLES } from '../../utils/constants';

/** Kanban columns, left to right. */
export const BOARD_COLUMNS = [
  { status: 'OPEN', title: 'Open' },
  { status: 'IN_PROGRESS', title: 'In progress' },
  { status: 'RESOLVED', title: 'Resolved' },
];
export const BOARD_STATUSES = BOARD_COLUMNS.map((c) => c.status);

/**
 * Which status changes each role may make. Mirrors the API's transition table
 * (server/src/modules/tasks/task.service.js): the UI uses it to show which columns accept a card,
 * the server still enforces it on every request.
 */
const TRANSITIONS = {
  [ROLES.EMPLOYEE]: {
    OPEN: ['IN_PROGRESS', 'RESOLVED'],
    IN_PROGRESS: ['OPEN', 'RESOLVED'],
    RESOLVED: [],
  },
  [ROLES.MANAGER]: {
    OPEN: ['IN_PROGRESS', 'RESOLVED'],
    IN_PROGRESS: ['OPEN', 'RESOLVED'],
    RESOLVED: ['OPEN', 'IN_PROGRESS'],
  },
};

export function canMove(role, from, to) {
  return from !== to && (TRANSITIONS[role]?.[from] ?? []).includes(to);
}

/** A card can be picked up only if it has somewhere to go. */
export function canDrag(role, status) {
  return (TRANSITIONS[role]?.[status] ?? []).length > 0;
}
