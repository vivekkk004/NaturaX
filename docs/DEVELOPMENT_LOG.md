# Development Log

A running record of what was built in each part and why.

## Part 0 – Requirements analysis and plan

- Read the assessment PDF fully; mapped every mandatory feature (A–F), technical requirement (§5)
  and live interview challenge (§7) to a component.
- Agreed decisions:
  - Local MongoDB, JavaScript (ES modules), my recommended defaults for the rest.
  - An order ID already in the DB is an **update** on re-upload; only duplicates _within one file_
    are errors.
  - Orders with bad data go to a **needs data correction** bucket and also get a low-priority
    DATA_CORRECTION task, so they are not forgotten either.
  - Tasks auto-resolve / reopen only when the order's data actually changes.
  - Reassigning an overdue task gives a new deadline but keeps `slaBreached = true`.
  - Uploaded files are stored in `server/uploads/`; MongoDB stores only the file path.
  - One git commit per part.

## Part 1 – Project setup

**Built**

- Monorepo with npm workspaces (`server`, `client`), root scripts: `dev`, `test`, `lint`, `format`, `build`.
- Tooling: ESLint 9 flat config (Node + React rules), Prettier, `.editorconfig`, `.gitattributes`
  (LF line endings), `.gitignore` (env files, uploads, build output).
- **Server skeleton**
  - `config/env.js` – Zod-validated environment, fails fast on bad config.
  - `config/logger.js` – pino (pretty in dev, JSON in prod, silent in tests, secrets redacted).
  - `config/db.js` – connect, detect replica set, `withTransaction()` with standalone fallback.
  - `config/paths.js` – resolves and creates the `uploads/` folder.
  - `errors/` – `AppError` + BadRequest/Validation/Unauthorized/Forbidden/NotFound/Conflict.
  - `middleware/` – `validate` (Zod), `notFound`, `errorHandler`, `rateLimiter`.
  - `app.js` (testable app factory) and `server.js` (startup + graceful shutdown).
  - `GET /api/health` – reports API, DB connection and transaction support (503 if DB down).
  - `scripts/initReplicaSet.js` – one-command replica-set initialisation (no mongosh needed).
- **Client skeleton** – Vite + React 19 + Tailwind 4, dev proxy `/api → :5000`, a single axios
  instance in `services/api.js`, status card calling `/api/health` through `healthService`.
- **Tests** – 6 passing (validate middleware unit tests; 404 / malformed JSON / health / security
  header integration tests).

**Why**

- App factory separate from `listen()` so supertest can run the app in-process.
- Health endpoint distinguishes "process alive" from "can actually serve" (DB down → 503).
- Transaction fallback because the local MongoDB is standalone; see DESIGN_DECISIONS D8.

**Issues met and fixed**

- Vite proxy to `localhost:5000` could resolve to IPv6 `::1` on Windows → target set to `127.0.0.1:5000`.
- Duplicate log lines for 4xx responses → the error handler now attaches the reason to the single
  request log line instead of logging separately.

## Part 2 – Auth, users and RBAC

**Built**

- Models: `User` (unique email + employeeCode, hidden `passwordHash`), `RefreshToken` (hashed token,
  family, TTL index). Shared `toJSON` plugin (`id` instead of `_id`, secrets stripped).
- `utils/tokens.js` – sign/verify access JWT (HS256 pinned, issuer/audience, unique `jti`),
  random refresh tokens, SHA-256 hashing.
- `middleware/auth.js` – `authenticate` (Bearer JWT → `req.user`, distinct `TOKEN_EXPIRED` code)
  and `authorize(...roles)` (RBAC, 403).
- `modules/auth` – login (generic error, timing-safe), refresh with rotation and reuse detection,
  logout, me. Login rate limiter.
- `modules/users` – manager-only list (pagination, sort whitelist, role/active filters, escaped
  search), get, create (409 on duplicates), update (deactivation / password reset revokes sessions;
  a manager cannot lock themselves out).
- `utils/pagination.js` – shared `listQuerySchema`, `paginate()` → `{ data, pagination }`.
- `scripts/seedUsers.js` – idempotent demo users (1 manager, 5 employees).
- Tests: in-memory replica-set setup + helpers; 26 tests passing (auth flows, token rotation and
  theft detection, RBAC, user CRUD, pagination).

**Issues met and fixed**

- First test run hung: mongodb-memory-server was downloading a 70 MB binary on a slow connection →
  test setup now reuses the locally installed `mongod`.
- Two access tokens signed in the same second were identical → added a unique `jti` per token.

## Part 3 – Orders, file import and validation

**Built**

- `constants/order.js` – canonical statuses + synonym tables ("Shipped", "In Transit", "NDR" …),
  payment types, data status, dates required per status.
- `utils/dates.js` – IST-aware parser for every accepted date format, day boundaries, formatting.
- `import/columns.js` (header aliases → canonical fields), `import/normalizers.js` (phone, amount,
  status, payment, text), `import/parsers.js` (CSV via csv-parse, XLSX via ExcelJS, content
  sniffing, row limits), `import/rowValidator.js` (pure row + in-file duplicate validation).
- Models `Order` (unique `orderId`, `dataStatus`, `dataIssues`, `raw`, `sourceHash`) and
  `ImportBatch` (file path, status, summary, row-by-row issues).
- `middleware/upload.js` – multer disk storage in `server/uploads/`, generated filenames, extension
  and size checks, cleanup of orphaned files.
- `modules/imports` – upload (pipeline inside a transaction when available), history, report,
  download of the original file. `modules/orders` – filtered/paginated list, detail, employee scoping.
- `sample-data/orders_with_errors_demo.csv` – one row per validation case, with expected outcomes.
- Tests: 65 passing (dates, normalisation, row validation, duplicates, CSV/XLSX parsing, upload
  end-to-end, re-upload idempotency, RBAC and scoping).

**Issues met and fixed**

- `npm audit`: moderate advisory in ExcelJS's `uuid` → npm override to `uuid@11.1.1` (see D20).
- Live smoke test showed the last row reported as row 8 instead of 7: the file mixed LF and CRLF
  line endings and the parser counted the stray CR as a line. Fixed by declaring all three record
  delimiters; added a regression test.
- `res.download` refused the test upload folder (a dot-folder) and the error surfaced as 500 → the
  error handler now maps Express's own 4xx errors correctly.
- `withTransaction` can retry its callback, so the persistence step was made side-effect free on
  the in-memory results (it returns what it found instead of mutating).
- While updating docs, a PowerShell 5.1 find-and-replace read two UTF-8 Markdown files as ANSI and
  corrupted their special characters (mojibake). Both files were restored from git and re-edited
  with an encoding-safe tool; a repo-wide search confirmed no other file was affected.

## Part 4 – Rule engine, configurable rules, idempotent task generation

**Built**

- `rule-engine/` – `BaseRule` contract, five PDF rules + data-correction rule (one class each),
  `registry.js`, pure `engine.js`, reason formatting (durations, rupees).
- Models: `RuleConfig` (manager-editable thresholds/priority/deadline/action), `Task` (unique
  `{orderId, ruleType}`, order snapshot, SLA flag, source hash), `AuditLog` (append-only enforced).
- `modules/tasks/taskSync.service.js` – idempotent create / refresh / reopen / auto-resolve with
  audit entries (TASK_CREATED, TASK_ASSIGNED, REOPENED, AUTO_RESOLVED).
- `modules/rules` – list/get/update rule configs (validated per rule, audited as RULE_UPDATED),
  `POST /rules/evaluate` with optional `asOf`; evaluation service scanning relevant orders in
  chunks, one transaction per chunk, serialised runs, SLA-breach marking.
- Import now runs the engine automatically and stores `taskSummary` on the import batch.
- `jobs/ruleEvaluation.job.js` – node-cron every 15 min (IST), configurable/disable-able.
- `docs/RULE_ENGINE.md` – rules, triggers, idempotency table, how to change and add a rule
  (the add-a-rule example was executed to verify it works).
- Tests: 93 passing (15 rule unit tests incl. boundaries and the 24→12 h change; 13 lifecycle
  integration tests incl. re-upload, concurrency, time passing, auto-resolve, reopen, append-only),
  also verified with `TZ=UTC`.

**Live verification (real MongoDB):** demo file → 16 tasks; same file again → 0 created;
15-hour-old confirmed order → no task at 24 h, task after `PATCH thresholdHours: 12` + re-run,
RULE_UPDATED audit with 24 → 12. Demo data removed afterwards.

**Issues met and fixed**

- An integration test used `new Date('2026-10-20T18:00')`, which depends on the machine's timezone
  and would fail on a UTC CI server → replaced with an explicit IST helper; suite re-run with `TZ=UTC`.

## Part 5 – Task APIs and audit trail

**Built**

- `modules/tasks/taskQuery.js` – one filter builder (status/UNRESOLVED, rule, priority, employee,
  unassigned, overdue, search, order-date range, employee scoping) reused by tasks, dashboard and reports.
- `GET /tasks` (paginated, sortable incl. priority via `priorityRank`), `GET /tasks/:id`,
  `GET /tasks/:id/audit`, `PATCH /tasks/:id/status` (role-based transition table, optimistic
  locking, resolution note), `PATCH /tasks/:id/assign` (manager; overdue → fresh deadline +
  SLA breach kept; TASK_ASSIGNED vs REASSIGNED).
- `GET /audit` – filtered, paginated, employees limited to their own tasks' history.
- `Task` gained `priorityRank` and a computed `isOverdue` virtual.
- Tests: 106 passing – incl. employee scoping, transitions, overdue reassignment (challenge 5)
  and a rollback test proving reassignment + audit are atomic.

**Issues met and fixed**

- Explicit deadlines lost their milliseconds (the date parser works to the second) – a test
  expectation was adjusted; second precision is intended for deadlines.

## Part 6 – Dashboard and daily report APIs

**Built**

- `GET /dashboard` – totals (orders, needs correction, orders requiring attention, open, in
  progress, resolved, unresolved, overdue, high priority), by category, by priority, employee-wise
  pending (incl. idle employees and unassigned), 10 most urgent high-priority cases, last import.
  Filterable by date, exception type, employee, priority; employees see their own numbers.
- `modules/tasks/taskStats.js` – shared overdue expression and employee workload aggregation.
- `GET /reports/daily` (JSON preview) and `GET /reports/daily/csv` (streamed, all or one section).
- `utils/csvStream.js` – backpressure-aware CSV writer + download headers with BOM.
- Error handler: hands over to Express if a streamed response fails mid-way.
- Tests: 113 passing (dashboard numbers under every filter, employee scoping, report sections,
  CSV headers/BOM/content parsed back, single-section download, RBAC).

**Issues met and fixed**

- A cleanup test counted files in the shared test upload folder; with more test files uploading
  in parallel it became flaky. It now checks for a unique marker in the uploaded content instead
  (3 consecutive green runs).

## Parts 7–8 – Frontend (foundation + features)

- Redux Toolkit store with one slice per domain (auth, dashboard, tasks, orders, imports, reports,
  audit, rules, employees), `createAsyncThunk` for every API call, stale-response guard via
  `requestId`, memoised query selectors, full store reset on logout/session expiry.
- Service layer (`services/*.js`) over one axios instance; interceptors attach the in-memory access
  token and do a single-flight silent refresh on `TOKEN_EXPIRED`.
- Protected + role-based routes, lazy-loaded pages (code splitting), responsive layout with a mobile drawer.
- Reusable components: DataTable, Pagination, FilterBar (debounced search), StatusBadge, PriorityBadge,
  Modal (accessible), StatCard, Loader, ErrorBoundary, Empty/Error states.
- Pages: Login, Dashboard (stat cards with drill-down, validated colour-blind-safe charts with a table
  view), Tasks (filters, sort, task modal with status changes, reassignment and audit history),
  Orders (data-correction bucket, raw file values), Import (client-side checks, row-by-row report,
  history), Daily report (sections + CSV downloads), Audit trail, Rule settings (edit + run now), Employees.
- 15 client unit tests (auth/session reset, stale responses, formatting, audit descriptions).

## Part 9 – Seed data and sample files (in progress)

- `scripts/generateSampleData.js` – deterministic 121-row CSV + XLSX with every planted case and an
  expected-results file; an integration test verifies the counts for CSV and XLSX and at different
  times of day (it caught a date-boundary bug in the generator, now fixed).
- `scripts/seed.js` – resets demo data, imports yesterday's sheet, simulates the team's work through
  the real services (audited), reassigns an overdue task, runs a catch-up evaluation, writes today's sample.
- Not yet done: browser walkthrough of the UI, docker-compose, Part 10 docs (BUSINESS_IMPACT,
  INTERVIEW_PREP, final README/API/ARCHITECTURE updates for the frontend).
