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
