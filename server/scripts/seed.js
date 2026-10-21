/**
 * Builds a complete, realistic demo state in one command:  npm run seed
 *
 *  1. Resets demo data (orders, tasks, audit log, imports, rule configs, sessions, uploaded files).
 *  2. Creates the demo users (1 manager, 5 employees).
 *  3. Imports "yesterday's" order sheet as of yesterday -> tasks whose deadlines have now passed.
 *  4. Simulates the team's work through the real services (so every step is audited):
 *     some tasks in progress, some resolved with notes, one overdue task reassigned.
 *  5. Runs the rule engine at the current time (what the 15-minute scheduler would do).
 *  6. Writes fresh upload files for TODAY (sample-data/orders_sample.csv/.xlsx, IDs "NX-...").
 *
 * The seeded history uses order IDs "NXS-..." so uploading today's sample adds new orders
 * instead of colliding with the seeded ones.
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { UPLOAD_PATH, ensureUploadDir } from '../src/config/paths.js';
import { ROLES } from '../src/constants/roles.js';
import { TASK_STATUS } from '../src/constants/tasks.js';
import { Task } from '../src/models/Task.js';
import { importOrders } from '../src/modules/imports/import.service.js';
import { ensureRuleConfigs } from '../src/modules/rules/ruleConfig.service.js';
import { runRuleEvaluation } from '../src/modules/rules/ruleEvaluation.service.js';
import { assignTask, updateTaskStatus } from '../src/modules/tasks/task.service.js';
import { addHours } from '../src/utils/dates.js';
import { DEMO_PASSWORDS, seedUsers } from './seedUsers.js';
import { generateSampleOrders, toCsv, writeSampleFiles } from './generateSampleData.js';

const RESET_COLLECTIONS = [
  'orders',
  'tasks',
  'auditlogs',
  'importbatches',
  'ruleconfigs',
  'refreshtokens',
];
const SAMPLE_DIR = path.resolve(import.meta.dirname, '..', '..', 'sample-data');

const actorOf = (user) => ({ id: user._id.toString(), role: user.role, name: user.name });

async function resetDemoData() {
  const existing = new Set(
    (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name),
  );
  for (const name of RESET_COLLECTIONS) {
    // Direct driver call: the audit log refuses deletes through the app on purpose.
    if (existing.has(name)) await mongoose.connection.db.collection(name).deleteMany({});
  }
  ensureUploadDir();
  for (const file of fs.readdirSync(UPLOAD_PATH)) {
    if (file !== '.gitkeep') fs.rmSync(path.join(UPLOAD_PATH, file), { force: true });
  }
}

/** Saves yesterday's sheet into the upload folder, exactly like a real upload would. */
function storeSeedFile(now) {
  const data = generateSampleOrders({ now, idPrefix: 'NXS-', seed: 7 });
  const fileName = `${Date.now()}-seed.csv`;
  const filePath = path.join(UPLOAD_PATH, fileName);
  fs.writeFileSync(filePath, toCsv(data));
  return {
    originalname: 'orders_yesterday.csv',
    path: filePath,
    fileType: 'csv',
    size: fs.statSync(filePath).size,
  };
}

/** Employees work on their tasks: every 3rd in progress, every 4th resolved (with a note). */
async function simulateTeamActivity(users) {
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const tasks = await Task.find({ assignedTo: { $ne: null } })
    .sort({ orderId: 1, ruleType: 1 })
    .lean();
  let inProgress = 0;
  let resolved = 0;

  for (const [i, task] of tasks.entries()) {
    const owner = actorOf(byId.get(task.assignedTo.toString()));
    if (i % 4 === 0) {
      await updateTaskStatus(task._id, { status: TASK_STATUS.IN_PROGRESS }, owner);
      await updateTaskStatus(
        task._id,
        {
          status: TASK_STATUS.RESOLVED,
          note: 'Called the customer and followed up with the courier',
        },
        owner,
      );
      resolved += 1;
    } else if (i % 3 === 0) {
      await updateTaskStatus(
        task._id,
        { status: TASK_STATUS.IN_PROGRESS, note: 'Working on it' },
        owner,
      );
      inProgress += 1;
    }
  }
  return { inProgress, resolved };
}

/** Live challenge 5 in the seed: an overdue task of Priya's goes to Anjali. */
async function reassignOneOverdueTask(users, manager) {
  const priya = users.find((u) => u.employeeCode === 'EMP001');
  const anjali = users.find((u) => u.employeeCode === 'EMP003');
  const task = await Task.findOne({
    assignedTo: priya._id,
    status: TASK_STATUS.OPEN,
    deadline: { $lt: new Date() },
  }).sort({ priorityRank: 1, deadline: 1 });
  if (!task) return null;
  await assignTask(
    task._id,
    { assignedTo: anjali._id.toString(), note: 'Priya is on leave today' },
    actorOf(manager),
  );
  return task.orderId;
}

async function main() {
  if (env.isProduction && !process.argv.includes('--force')) {
    throw new Error('Refusing to reset data in production (pass --force if you really mean it).');
  }
  await connectDB(env.MONGODB_URI);
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  console.log('Resetting demo data...');
  await resetDemoData();
  const users = await seedUsers();
  const manager = users.find((u) => u.role === ROLES.MANAGER);
  await ensureRuleConfigs();

  const now = new Date();
  const yesterday = addHours(now, -24);
  console.log("Importing yesterday's order sheet...");
  const batch = await importOrders({
    file: storeSeedFile(yesterday),
    actor: actorOf(manager),
    asOf: yesterday,
  });

  console.log('Simulating the team working on tasks...');
  const activity = await simulateTeamActivity(users);
  const reassigned = await reassignOneOverdueTask(users, manager);

  console.log('Running the rule engine for today (as the scheduler would)...');
  const catchUp = await runRuleEvaluation({ now, note: 'Scheduled rule evaluation' });

  const sample = await writeSampleFiles(SAMPLE_DIR, { now });

  const [open, inProgressNow, resolvedNow, overdue] = await Promise.all([
    Task.countDocuments({ status: TASK_STATUS.OPEN }),
    Task.countDocuments({ status: TASK_STATUS.IN_PROGRESS }),
    Task.countDocuments({ status: TASK_STATUS.RESOLVED }),
    Task.countDocuments({ status: { $ne: TASK_STATUS.RESOLVED }, deadline: { $lt: new Date() } }),
  ]);

  console.log('\nDemo data ready.');
  console.table({
    "Yesterday's import": `${batch.summary.totalRows} rows, ${batch.summary.created} orders, ${batch.taskSummary.created} tasks`,
    'Team activity': `${activity.inProgress} in progress, ${activity.resolved} resolved, reassigned: ${reassigned ?? 'none'}`,
    'Catch-up evaluation': `${catchUp.created} new tasks (orders that aged past a threshold)`,
    'Tasks now': `${open} open, ${inProgressNow} in progress, ${resolvedNow} resolved, ${overdue} overdue`,
    "Today's upload file": `sample-data/orders_sample.csv / .xlsx (reference ${sample.meta.referenceTimeIst} IST)`,
  });
  console.log(
    `\nLogin: manager@naturax.in / ${DEMO_PASSWORDS.MANAGER}   (employees: priya|rahul|anjali|arjun|sneha@naturax.in / ${DEMO_PASSWORDS.EMPLOYEE})`,
  );
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
