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
