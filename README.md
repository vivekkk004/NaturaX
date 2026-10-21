# NaturaX – D2C Order Follow-up Automation System

An internal web application for a D2C company. It imports the daily order sheet (CSV or Excel),
automatically finds the orders that need attention – unconfirmed, not dispatched on time, delayed in
transit, failed delivery, high-value and late – turns each one into a **follow-up task** with a reason,
priority, recommended action, owner and deadline, and records every assignment and status change in
an **append-only audit trail**. Nothing is tracked in Excel or WhatsApp any more, so nothing is forgotten.

Built as the technical assessment "D2C Order Follow-up Automation System" for Vitanatura Elements
Pvt Ltd (NaturaX).

## Features

| PDF requirement           | Where / how                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Order data import      | **Import orders** page: CSV/XLSX upload, row-by-row report of missing fields, duplicate order IDs, invalid dates (+ phone, amount, status checks) |
| B. Automatic rule engine  | 5 rules (+ data-correction rule), one class each; thresholds stored in MongoDB and editable on **Rule settings**                                  |
| C. Task assignment        | Each exception = a task with order + customer, reason, priority, owner, action, deadline, status; manager reassigns                               |
| D. Dashboard              | Total orders, orders requiring attention, open/overdue, by category, employee-wise, high-priority – 4 filters                                     |
| E. Daily exception report | **Daily report** page + streamed CSV: new, unresolved, overdue, high-priority, employee-wise pending                                              |
| F. Audit trail            | Every creation, assignment, status change, reassignment, reopen, auto-resolve and rule change; old → new values                                   |
| Persistence               | MongoDB – tasks and audit records survive refreshes and restarts                                                                                  |
| Validation & errors       | Zod on every request, central error handler, consistent `{ error: { code, message, details } }`                                                   |
| Duplicate prevention      | Unique index `(orderId, ruleType)` + content hash – re-uploading a file creates **0** new tasks                                                   |

Also: JWT access token + rotating refresh cookie, Manager/Employee roles enforced by the API, a
15-minute scheduler for time-based rules, and a deterministic sample-data generator.

## Tech stack

- **Frontend:** React 19 (Vite), Redux Toolkit (`createAsyncThunk`), React Router, axios, Recharts, Tailwind CSS
- **Backend:** Node.js ≥ 22.9, Express 5, MongoDB + Mongoose 9, Zod, pino, multer, ExcelJS, csv-parse, node-cron
- **Quality:** Vitest (133 tests), supertest, mongodb-memory-server, ESLint, Prettier
- **Language:** JavaScript (ES modules) – why: [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md)

## Quick start (local)

Prerequisites: **Node.js 22.9+** and **MongoDB** running on `127.0.0.1:27017`.

```bash
npm install                                   # root + server + client (npm workspaces)
cp server/.env.example server/.env            # PowerShell: Copy-Item server/.env.example server/.env
# edit server/.env: set JWT_ACCESS_SECRET to a long random string (command below)
npm run seed                                  # demo users + yesterday's orders, tasks, activity, audit
npm run dev                                   # API http://localhost:5000 + UI http://localhost:5173
```

Open **http://localhost:5173** and sign in (the login page has one-click **Manager** / **Employee** demo buttons).

Secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

### Demo logins (created by `npm run seed` or `npm run seed:users -w server`)

| Role     | Name         | Email                | Code   | Password       |
| -------- | ------------ | -------------------- | ------ | -------------- |
| Manager  | Meera Nair   | `manager@naturax.in` | MGR001 | `Manager@123`  |
| Employee | Priya Sharma | `priya@naturax.in`   | EMP001 | `Employee@123` |
| Employee | Rahul Verma  | `rahul@naturax.in`   | EMP002 | `Employee@123` |
| Employee | Anjali Menon | `anjali@naturax.in`  | EMP003 | `Employee@123` |
| Employee | Arjun Reddy  | `arjun@naturax.in`   | EMP004 | `Employee@123` |
| Employee | Sneha Patil  | `sneha@naturax.in`   | EMP005 | `Employee@123` |

### Sample data

| File                                      | Use                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `sample-data/orders_sample.csv` / `.xlsx` | 121 rows: normal orders + every planted exception, duplicate and bad-data case   |
| `sample-data/orders_sample.meta.json`     | reference time and expected results of the sample                                |
| `sample-data/orders_with_errors_demo.csv` | 20 rows, one per validation case – for the "upload a file with errors" challenge |

The sample is generated **relative to a reference time**. Regenerate it right before a demo:
`npm run generate:sample` (or `npm run generate:sample -- --now 2026-10-20T18:00`), then upload it with
"Evaluate as of" = the printed reference time to reproduce the expected counts exactly. Details:
[sample-data/README.md](sample-data/README.md).

## Commands

| Command                             | What it does                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run dev`                       | API + UI with auto-reload                                                                              |
| `npm test`                          | 118 server + 15 client tests (in-memory MongoDB, never your real DB)                                   |
| `npm run lint` / `npm run format`   | ESLint / Prettier                                                                                      |
| `npm run seed`                      | **Resets demo data** and builds a realistic demo state                                                 |
| `npm run generate:sample`           | Writes a fresh `sample-data/orders_sample.csv/.xlsx`                                                   |
| `npm run build` then `npm start`    | Production: Express serves the built UI on one port (set `NODE_ENV=production` or `SERVE_CLIENT=true`) |
| `npm run seed:users -w server`      | Create / reset only the demo users                                                                     |
| `npm run db:init-replica -w server` | Initialise a local single-node replica set (see below)                                                 |

## Docker (optional)

```bash
docker compose up --build                             # MongoDB replica set + app on http://localhost:5000
docker compose exec app node server/scripts/seed.js   # demo data
```

The Dockerfile is multi-stage (non-root runtime user); compose runs MongoDB as a single-node replica
set so transactions are enabled. _The Docker files were written but not executed on the development
machine (Docker is not installed there); the production build they use was verified locally._

## Deploying: UI on Vercel, API on Render, database on Atlas

Live: UI **https://natura-x.vercel.app** · API **https://naturax.onrender.com** (health: `/api/health`).

The UI calls the API on another site directly:

- **API URL:** `client/.env.production` sets `VITE_API_BASE_URL=https://naturax.onrender.com/api`
  (a value set in the Vercel dashboard overrides it; "with or without `/api`" both work).
- **CORS:** the API allows only the origins in `CLIENT_ORIGIN`, with credentials.
- **Login cookie:** in production the API automatically sends the refresh cookie as
  `SameSite=None; Secure` to an allowed UI on another site, so sessions survive reloads (verified
  with a cross-site local setup). Safari blocks third-party cookies by default – there, users log
  in again after a reload; everything else works.
- Render's free tier sleeps when idle: the first request can take ~50 s (the UI waits up to 70 s).

**Vercel** (project Root Directory = `client`, framework Vite): no variables needed.
`client/vercel.json` sends every path to `index.html`, so reloading `/tasks` works.

**Render** (Web Service, Root Directory = `server`, build `npm install`, start `node src/server.js`):

| Variable            | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`          | `production`                                                       |
| `MONGODB_URI`       | `mongodb+srv://USER:PASSWORD@cluster…mongodb.net/naturax_followup` |
| `JWT_ACCESS_SECRET` | long random string                                                 |
| `CLIENT_ORIGIN`     | `https://natura-x.vercel.app` (exact, required for CORS)           |
| `SERVE_CLIENT`      | `false` (the UI is on Vercel)                                      |

**Atlas → Network Access:** allow `0.0.0.0/0` (Render's IPs change); the database user and password
still protect the cluster.

_Alternative (first-party cookie everywhere, incl. Safari):_ add a Vercel rewrite
`{ "source": "/api/:path*", "destination": "https://naturax.onrender.com/api/:path*" }` before the
`index.html` rule in `client/vercel.json` and set `VITE_API_BASE_URL=/api` on Vercel.

## Environment variables (`server/.env`)

| Variable                                       | Default                      | Purpose                                                      |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                                     | `development`                | `development` / `test` / `production`                        |
| `PORT`                                         | `5000`                       | API port                                                     |
| `MONGODB_URI`                                  | –                            | MongoDB connection string (**required**)                     |
| `CLIENT_ORIGIN`                                | `http://localhost:5173`      | Allowed CORS origin(s), comma-separated                      |
| `LOG_LEVEL`                                    | `info`                       | pino log level                                               |
| `UPLOAD_DIR`                                   | `uploads`                    | Folder for uploaded files (DB stores only the path)          |
| `MAX_UPLOAD_SIZE_MB`                           | `5`                          | Upload size limit                                            |
| `RATE_LIMIT_WINDOW_MINUTES` / `RATE_LIMIT_MAX` | `15` / `500`                 | API rate limit per IP                                        |
| `LOGIN_RATE_LIMIT_MAX`                         | `10`                         | Failed logins per IP per 15 min                              |
| `JWT_ACCESS_SECRET`                            | – (**required**, ≥ 32 chars) | Signs access tokens                                          |
| `JWT_ACCESS_EXPIRES_IN`                        | `15m`                        | Access-token lifetime                                        |
| `REFRESH_TOKEN_TTL_DAYS`                       | `7`                          | Refresh-cookie lifetime                                      |
| `BCRYPT_SALT_ROUNDS`                           | `12`                         | Password hashing cost                                        |
| `SERVE_CLIENT`                                 | `true` in production         | Serve `client/dist` from Express                             |
| `COOKIE_SAME_SITE`                             | `strict`                     | Refresh-cookie mode; `none` only for direct cross-site calls |
| `TRUST_PROXY`                                  | `1` in production, else `0`  | Reverse proxies in front of the app (real client IP)         |
| `RULE_ENGINE_CRON`                             | `*/15 * * * *`               | Scheduled rule evaluation (cron, Asia/Kolkata)               |
| `RULE_ENGINE_CRON_ENABLED`                     | `true`                       | Turn the scheduler on/off                                    |

The server validates these at startup and refuses to start, naming the problem, if one is invalid.

## Enabling MongoDB transactions (recommended, one-time)

The app works on a standalone MongoDB (each write is atomic on its own document), but multi-document
**transactions** – e.g. a reassignment and its audit entry saved together – need a replica set.
On Windows (PowerShell **as Administrator**):

1. Add to `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg`:
   ```yaml
   replication:
     replSetName: rs0
   ```
2. `Restart-Service MongoDB`
3. `npm run db:init-replica -w server`
4. In `server/.env`: `MONGODB_URI=mongodb://127.0.0.1:27017/naturax_followup?replicaSet=rs0`
5. Restart the API – `/api/health` now reports `"transactions": true`. Existing data is kept.

## Project structure

```
NaturaX/
├─ server/              Express API – routes → controllers → services → models
│  ├─ src/rule-engine/  pure rule engine: one class per rule
│  ├─ src/import/       CSV/XLSX parsing and pure row validation
│  ├─ src/modules/      auth, users, imports, orders, rules, tasks, audit, dashboard, reports
│  ├─ scripts/          seed, sample generator, replica-set init
│  └─ tests/            unit + integration tests
├─ client/              React SPA – features/ (slices), pages/, components/, services/, routes/
├─ docs/                architecture, database, API, rule engine, decisions, business impact, interview prep
└─ sample-data/         files to upload + expected results
```

## Documentation

| Document                                     | Contents                                                   |
| -------------------------------------------- | ---------------------------------------------------------- |
| [ARCHITECTURE](docs/ARCHITECTURE.md)         | System design, data flow, diagrams, frontend architecture  |
| [DATABASE](docs/DATABASE.md)                 | Every collection, field and index, and why                 |
| [API](docs/API.md)                           | Every endpoint with examples and allowed roles             |
| [RULE_ENGINE](docs/RULE_ENGINE.md)           | The rules, idempotency, how to change or add a rule        |
| [DESIGN_DECISIONS](docs/DESIGN_DECISIONS.md) | Why each major choice was made, and the trade-offs         |
| [BUSINESS_IMPACT](docs/BUSINESS_IMPACT.md)   | The five business questions from the PDF                   |
| [INTERVIEW_PREP](docs/INTERVIEW_PREP.md)     | Live-challenge walkthroughs, demo script, likely questions |
| [DEVELOPMENT_LOG](docs/DEVELOPMENT_LOG.md)   | What was built in each part, issues met and fixed          |

## Assumptions (summary)

All times are IST (stored as UTC); dates are day-first (DD-MM-YYYY). Dispatch delay is measured from
the order date (the file has no "confirmed at" column). A date-only expected delivery date means "by
the end of that day". An order ID already in the database is an update, not a duplicate; only
repeats within one file are duplicates. Details in [DESIGN_DECISIONS](docs/DESIGN_DECISIONS.md).
