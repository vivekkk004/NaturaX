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
