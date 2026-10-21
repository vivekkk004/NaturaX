# NaturaX – D2C Order Follow-up Automation System

An internal web application that imports daily order files (CSV/Excel), automatically detects orders
that need attention (unconfirmed, dispatch-delayed, shipment-delayed, failed delivery, high-value
delayed), turns each one into an assigned follow-up task with a priority, action and deadline, and
records every change in an append-only audit trail. Built as the technical assessment
"D2C Order Follow-up Automation System" for Vitanatura Elements Pvt Ltd (NaturaX).

> **Build status:** being built in parts – see [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md).
> Parts 1–4 are complete: project setup, auth/users/RBAC, order import with validation,
> rule engine with configurable rules and duplicate-free task generation.

## Features (target scope)

| Area                 | What it does                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Order import         | Upload CSV/XLSX; row-by-row report of missing fields, duplicate order IDs and invalid dates   |
| Rule engine          | 5 pluggable rules with thresholds stored in the DB and editable by a manager                  |
| Tasks                | One task per (order, rule); priority, action, deadline, Open → In Progress → Resolved         |
| Idempotent re-upload | Re-uploading the same file never creates duplicate tasks (unique `orderId + ruleType`)        |
| Dashboard            | Totals, attention needed, open/overdue, by category, per employee, high priority – filterable |
| Daily report         | New, unresolved, overdue, high-priority, employee-wise pending – downloadable CSV             |
| Audit trail          | Every assignment, status change and reassignment with old → new values, user and timestamp    |
| Security             | JWT access + rotating refresh token, RBAC (Manager / Employee), helmet, rate limiting, bcrypt |

## Tech stack

- **Frontend:** React 19 (Vite), Redux Toolkit, React Router, axios, Recharts, Tailwind CSS
- **Backend:** Node.js (≥ 22.9), Express 5, Mongoose 9 / MongoDB, Zod, pino
- **Testing / quality:** Vitest, supertest, ESLint (flat config), Prettier
- **Language:** JavaScript (ES modules) – see [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md)

## Project structure

```
NaturaX/
├─ server/          Express API (routes → controllers → services → models)
│  ├─ src/          app code (config, errors, middleware, modules, ...)
│  ├─ scripts/      one-off scripts (replica-set init, seed, sample-data generator)
│  ├─ tests/        unit + integration tests
│  └─ uploads/      uploaded import files (only their path is stored in MongoDB)
├─ client/          React SPA
├─ docs/            architecture, database, API, rule engine, decisions, interview prep
└─ sample-data/     sample CSV/XLSX files to upload
```

## Prerequisites

- Node.js **22.9 or newer** (`node -v`)
- MongoDB running locally on `127.0.0.1:27017` (tested with MongoDB 8.2 Community)

## Setup and run

```bash
# 1. install all dependencies (root + server + client workspaces)
npm install

# 2. create the server environment file and adjust if needed
cp server/.env.example server/.env          # PowerShell: Copy-Item server/.env.example server/.env

# 3. start API (http://localhost:5000) and UI (http://localhost:5173) together
npm run dev
```

Open http://localhost:5173 – the status card should show API `ok` and Database `connected`.
Health endpoint: `GET http://localhost:5000/api/health`.

## Environment variables (`server/.env`)

| Variable                    | Default                                      | Purpose                                         |
| --------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`                  | `development`                                | `development` / `test` / `production`           |
| `PORT`                      | `5000`                                       | API port                                        |
| `MONGODB_URI`               | `mongodb://127.0.0.1:27017/naturax_followup` | MongoDB connection string (required)            |
| `CLIENT_ORIGIN`             | `http://localhost:5173`                      | Allowed CORS origin(s), comma-separated         |
| `LOG_LEVEL`                 | `info`                                       | pino log level                                  |
| `UPLOAD_DIR`                | `uploads`                                    | Folder (relative to `server/`) for import files |
| `MAX_UPLOAD_SIZE_MB`        | `5`                                          | Upload size limit                               |
| `RATE_LIMIT_WINDOW_MINUTES` | `15`                                         | Rate-limit window                               |
| `RATE_LIMIT_MAX`            | `500`                                        | Max requests per IP per window                  |
| `LOGIN_RATE_LIMIT_MAX`      | `10`                                         | Failed logins per IP per 15 min                 |
| `JWT_ACCESS_SECRET`         | – (required, ≥ 32 chars)                     | Signs access tokens                             |
| `JWT_ACCESS_EXPIRES_IN`     | `15m`                                        | Access-token lifetime                           |
| `REFRESH_TOKEN_TTL_DAYS`    | `7`                                          | Refresh-token (cookie) lifetime                 |
| `BCRYPT_SALT_ROUNDS`        | `12`                                         | Password hashing cost                           |
| `RULE_ENGINE_CRON`          | `*/15 * * * *`                               | How often rules re-run (cron, IST)              |
| `RULE_ENGINE_CRON_ENABLED`  | `true`                                       | Turn the scheduled re-evaluation off/on         |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

The server validates these at startup and refuses to start with a clear message if one is invalid.

## Optional: enable MongoDB transactions (single-node replica set)

The app works on a standalone MongoDB (it falls back to single-document atomic writes), but
multi-document **transactions** – used e.g. so a task reassignment and its audit record are saved
together – require a replica set. One-time setup on Windows (run PowerShell **as Administrator**):

1. Edit `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg` and add:
   ```yaml
   replication:
     replSetName: rs0
   ```
2. `Restart-Service MongoDB`
3. From the project root: `npm run db:init-replica -w server`
4. In `server/.env` set `MONGODB_URI=mongodb://127.0.0.1:27017/naturax_followup?replicaSet=rs0`
5. Restart the API – the log and `/api/health` now report `transactions: true`.

Existing data is kept; a single-node replica set behaves like the standalone server otherwise.

## Scripts

| Command                             | What it does                                 |
| ----------------------------------- | -------------------------------------------- |
| `npm run dev`                       | API + UI with auto-reload                    |
| `npm test`                          | All tests (server + client)                  |
| `npm run lint` / `npm run format`   | ESLint / Prettier over the whole repo        |
| `npm run build`                     | Production build of the UI (`client/dist`)   |
| `npm run db:init-replica -w server` | Initialise the local single-node replica set |
| `npm run seed:users -w server`      | Create / reset the demo users (idempotent)   |

Tests use an in-memory MongoDB replica set (`mongodb-memory-server`) – they never touch your real
database. If MongoDB is installed locally its `mongod` binary is reused; otherwise one is downloaded
once (~70 MB). Set `MONGOMS_SYSTEM_BINARY` to point at a specific `mongod`.

## Demo logins

Created by `npm run seed:users -w server`:

| Role     | Name         | Email                | Employee code | Password       |
| -------- | ------------ | -------------------- | ------------- | -------------- |
| Manager  | Meera Nair   | `manager@naturax.in` | MGR001        | `Manager@123`  |
| Employee | Priya Sharma | `priya@naturax.in`   | EMP001        | `Employee@123` |
| Employee | Rahul Verma  | `rahul@naturax.in`   | EMP002        | `Employee@123` |
| Employee | Anjali Menon | `anjali@naturax.in`  | EMP003        | `Employee@123` |
| Employee | Arjun Reddy  | `arjun@naturax.in`   | EMP004        | `Employee@123` |
| Employee | Sneha Patil  | `sneha@naturax.in`   | EMP005        | `Employee@123` |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) ·
  [Design decisions](docs/DESIGN_DECISIONS.md) · [Development log](docs/DEVELOPMENT_LOG.md)
- [Sample data](sample-data/README.md) – files to upload, with the expected result of every row.
- [Rule engine](docs/RULE_ENGINE.md) – every rule, idempotency, how to change or add a rule.
- Business impact and interview prep docs are added as their parts are built.
