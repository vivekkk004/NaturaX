# Database

MongoDB (via Mongoose). Every model uses `timestamps: true` (`createdAt`, `updatedAt`) and a shared
`toJSON` plugin that exposes `id` instead of `_id`, drops `__v` and strips secret fields.

General indexing rule followed: **every field we filter or sort on in a list endpoint has an index;
every business key that must be unique has a unique index** (the database, not application code, is
the final guarantee against duplicates – application checks can race, a unique index cannot).

## users

| Field          | Type    | Notes                                                                 |
| -------------- | ------- | --------------------------------------------------------------------- |
| `name`         | String  | required, ≤ 100 chars                                                 |
| `email`        | String  | required, **unique**, stored lowercase                                |
| `employeeCode` | String  | required, **unique**, uppercase (e.g. `EMP001`) – used in order files |
| `passwordHash` | String  | bcrypt hash, `select: false` (never loaded unless asked), never sent  |
| `role`         | String  | `MANAGER` \| `EMPLOYEE`                                               |
| `isActive`     | Boolean | deactivated users cannot log in or refresh                            |
| `lastLoginAt`  | Date    |                                                                       |

| Index                        | Why                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| `{ email: 1 }` unique        | login lookup; no two accounts per email                      |
| `{ employeeCode: 1 }` unique | resolve "Assigned employee" from import files; no duplicates |
| `{ role: 1, isActive: 1 }`   | "list active employees" for assignment and workload widgets  |

## refreshtokens

| Field                      | Type     | Notes                                                     |
| -------------------------- | -------- | --------------------------------------------------------- |
| `user`                     | ObjectId | → users                                                   |
| `tokenHash`                | String   | SHA-256 of the token – the raw token is never stored      |
| `family`                   | String   | UUID shared by all tokens rotated from one login          |
| `expiresAt`                | Date     |                                                           |
| `revokedAt`                | Date     | set when rotated, logged out, or the family is revoked    |
| `replacedByHash`           | String   | hash of the token that replaced this one (rotation chain) |
| `createdByIp`, `userAgent` | String   | for security investigation                                |

| Index                                            | Why                                                          |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `{ tokenHash: 1 }` unique                        | O(1) lookup on every refresh                                 |
| `{ expiresAt: 1 }` TTL (`expireAfterSeconds: 0`) | MongoDB deletes expired tokens automatically                 |
| `{ user: 1 }`                                    | revoke all sessions of a user (deactivation, password reset) |
| `{ family: 1 }`                                  | revoke a whole family on token reuse                         |

## orders

One document per real-world order, keyed by the business `orderId`.

| Field                                 | Type     | Notes                                                                                           |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `orderId`                             | String   | **unique**, uppercase (`ord-1` and `ORD-1` are the same order)                                  |
| `orderDate`                           | Date     | UTC instant (input read as IST)                                                                 |
| `customerName`                        | String   |                                                                                                 |
| `phone`                               | String   | normalised to 10 digits (`+91 98765 43210` → `9876543210`)                                      |
| `orderValue`                          | Number   | rupees (`₹7,499` → `7499`)                                                                      |
| `paymentType`                         | String   | `PREPAID` \| `COD`                                                                              |
| `status`                              | String   | `UNCONFIRMED` \| `CONFIRMED` \| `DISPATCHED` \| `DELIVERED` \| `DELIVERY_FAILED` \| `CANCELLED` |
| `rawStatus`                           | String   | as written in the file ("In Transit")                                                           |
| `dispatchDate`                        | Date     |                                                                                                 |
| `expectedDeliveryDate`                | Date     | date-only input stored as **end of that IST day** (23:59:59.999)                                |
| `assignedEmployeeRaw`                 | String   | as written in the file                                                                          |
| `assignedTo`                          | ObjectId | → users; `null` when the employee could not be matched                                          |
| `dataStatus`                          | String   | `VALID` \| `NEEDS_CORRECTION` – only VALID orders are evaluated by rules                        |
| `dataIssues`                          | Array    | `{ field, code, message, severity }` errors and warnings from the last import                   |
| `raw`                                 | Object   | original cell values – kept only while the order needs correction                               |
| `sourceHash`                          | String   | SHA-256 of the normalised content → detects unchanged re-uploads                                |
| `firstImportBatch`, `lastImportBatch` | ObjectId | → importbatches (traceability)                                                                  |

| Index                              | Why                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `{ orderId: 1 }` unique            | idempotent upsert key; concurrent uploads can never create two copies      |
| `{ dataStatus: 1, status: 1 }`     | "needs correction" bucket and status filters; rule engine's candidate scan |
| `{ assignedTo: 1, orderDate: -1 }` | an employee's own orders, newest first                                     |
| `{ orderDate: -1 }`                | date-range filters and default sort                                        |

## importbatches

One document per uploaded file – the persisted row-by-row error report.

| Field                  | Type           | Notes                                                                                                               |
| ---------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `originalName`         | String         | the user's file name (display/download only – never used as a path)                                                 |
| `filePath`             | String         | **relative path of the stored file**, e.g. `uploads/1792…-a1b2c3.csv`; the file itself is on disk                   |
| `fileType`, `fileSize` | String, Number | `csv` \| `xlsx`, bytes                                                                                              |
| `uploadedBy`           | ObjectId       | → users                                                                                                             |
| `status`               | String         | `PROCESSING` → `COMPLETED` \| `FAILED`                                                                              |
| `failureReason`        | String         | why a whole file was rejected (missing columns, wrong content…)                                                     |
| `asOf`                 | Date           | the "current time" used to evaluate this file                                                                       |
| `summary`              | Object         | `totalRows, created, updated, unchanged, needsCorrection, rejected, duplicatesSkipped, keptPreviousValid, warnings` |
| `rowIssues`            | Array          | `{ row, orderId, field, code, message, severity, outcome }` (max 5 000 stored)                                      |
| `rowIssuesTruncated`   | Boolean        | true if more issues existed than were stored                                                                        |

| Index                              | Why                          |
| ---------------------------------- | ---------------------------- |
| `{ createdAt: -1 }`                | import history, newest first |
| `{ uploadedBy: 1, createdAt: -1 }` | "my uploads"                 |

## ruleconfigs

The live, manager-editable configuration of each rule – the **source of truth** for thresholds.

| Field           | Type     | Notes                                                                              |
| --------------- | -------- | ---------------------------------------------------------------------------------- |
| `ruleType`      | String   | **unique** – `UNCONFIRMED_ORDER`, `DISPATCH_DELAY`, …                              |
| `enabled`       | Boolean  | disabled rules never fire                                                          |
| `params`        | Object   | rule-specific, validated by the rule's Zod schema, e.g. `{ "thresholdHours": 24 }` |
| `priority`      | String   | `HIGH` \| `MEDIUM` \| `LOW` given to new tasks                                     |
| `deadlineHours` | Number   | task deadline = detection time + this                                              |
| `action`        | String   | recommended next action copied into each task                                      |
| `updatedBy`     | ObjectId | → users                                                                            |

Index: `{ ruleType: 1 }` unique. Defaults are inserted on first start (`$setOnInsert`), never overwritten.

## tasks

One document per exception (exception and task are 1:1).

| Field                                                                          | Type             | Notes                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `orderId`, `order`                                                             | String, ObjectId | business key + reference to the order                                                                         |
| `ruleType`                                                                     | String           | exception category                                                                                            |
| `reason`                                                                       | String           | with real numbers: "Order unconfirmed for 5h 12m (limit 2h)"                                                  |
| `priority`                                                                     | String           | `HIGH` \| `MEDIUM` \| `LOW`                                                                                   |
| `actionRequired`                                                               | String           | recommended next action                                                                                       |
| `deadline`                                                                     | Date             | detection time + rule's `deadlineHours`                                                                       |
| `customer.name/phone`, `orderValue`, `orderDate`, `paymentType`, `orderStatus` | –                | **snapshot** of the order for lists, filters and reports without joins; refreshed when the order data changes |
| `assignedTo`                                                                   | ObjectId         | → users; `null` = unassigned queue                                                                            |
| `status`                                                                       | String           | `OPEN` \| `IN_PROGRESS` \| `RESOLVED`                                                                         |
| `detectedAt`, `lastDetectedAt`                                                 | Date             | first and latest evaluation that saw the problem                                                              |
| `resolvedAt`, `resolvedBy`, `resolutionNote`                                   | –                | `resolvedBy = null` with `resolvedAt` set = auto-resolved by the system                                       |
| `reopenCount`                                                                  | Number           | how often the problem came back                                                                               |
| `slaBreached`                                                                  | Boolean          | set once the deadline was missed; kept after reassignment (honest SLA metrics)                                |
| `sourceHash`                                                                   | String           | order content hash at last sync – drives reopen / auto-resolve                                                |

**Overdue is not stored**: it is `status ≠ RESOLVED AND deadline < now`, computed in queries so it can never be stale.

| Index                                       | Why                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `{ orderId: 1, ruleType: 1 }` **unique**    | **idempotency**: at most one task per order per rule, enforced by the DB |
| `{ assignedTo: 1, status: 1, deadline: 1 }` | "my open tasks", employee-wise pending, per-employee overdue             |
| `{ status: 1, deadline: 1 }`                | overdue queries                                                          |
| `{ ruleType: 1, priority: 1, status: 1 }`   | exceptions by category, priority filters, high-priority widget           |
| `{ detectedAt: -1 }`                        | daily report "new exceptions"                                            |
| `{ orderDate: -1 }`                         | dashboard date filter                                                    |

## auditlogs

**Append-only** trail of every assignment, status change, reassignment, reopen, auto-resolve and rule change.

| Field                         | Type     | Notes                                                                                            |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `action`                      | String   | `TASK_CREATED, TASK_ASSIGNED, STATUS_CHANGED, REASSIGNED, REOPENED, AUTO_RESOLVED, RULE_UPDATED` |
| `task`, `orderId`, `ruleType` | –        | what it is about (rule changes have only `ruleType`)                                             |
| `performedBy`                 | ObjectId | responsible user; `null` = System (scheduler)                                                    |
| `performedByName`             | String   | snapshot of the name at the time                                                                 |
| `oldValue`, `newValue`        | Object   | e.g. `{ "params": { "thresholdHours": 24 } }` → `{ … 12 }`                                       |
| `note`                        | String   | context ("Rule engine after import of orders.csv")                                               |
| `createdAt`                   | Date     | the timestamp (no `updatedAt` – entries never change)                                            |

Append-only enforcement: Mongoose middleware throws on every update/delete operation and on re-saving
an existing entry; the API has no update/delete endpoint. Entries are written in the same
transaction as the change they describe.

| Index                               | Why                     |
| ----------------------------------- | ----------------------- |
| `{ orderId: 1, createdAt: -1 }`     | history of an order     |
| `{ task: 1, createdAt: -1 }`        | history of a task       |
| `{ action: 1, createdAt: -1 }`      | filter by action type   |
| `{ performedBy: 1, createdAt: -1 }` | "what did this user do" |
| `{ createdAt: -1 }`                 | latest activity         |
