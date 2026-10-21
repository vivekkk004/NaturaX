# Design Decisions

Each entry: the decision, why, and what was rejected. Added as the project is built.

## D1. JavaScript (ES modules) instead of TypeScript

- **Why:** the code must be explained and changed live in an interview under time pressure; no
  compile step or type errors to fight. The data that really needs checking (uploaded CSV rows,
  request bodies) is checked at **runtime** with Zod – TypeScript types vanish at runtime anyway.
- **Trade-off:** no compile-time type safety. Mitigated with Zod, JSDoc on key functions, ESLint and tests.

## D2. Monorepo with npm workspaces (`server/`, `client/`)

- **Why:** one `npm install`, one `npm run dev` (via `concurrently`), one lint/format config.
- **Rejected:** two separate repos – extra friction for a single small product.

## D3. Express 5

- **Why:** Express 5 forwards rejected promises from async handlers to the error middleware, so no
  `asyncHandler` wrapper is needed around every controller. Less boilerplate, same safety.
- **Alternative:** Express 4 + an `asyncHandler(fn)` wrapper (`(req,res,next) => fn(req,res,next).catch(next)`).

## D4. Feature folders, layered inside (routes → controllers → services → models)

- **Why:** everything about "tasks" lives in `modules/tasks/`; inside, each layer has one job.
  Services contain business logic and are HTTP-agnostic, so a cron job can call them too.
- **No separate repository layer:** Mongoose models already _are_ the data-access abstraction; a
  repository that only forwards calls adds files without value. The code that needs isolation for
  testing – the rule engine – is pure (no DB at all).

## D5. Centralised errors with a custom hierarchy

- Services `throw new NotFoundError(...)`; one error handler maps errors to HTTP. Known library
  errors (Mongoose validation/cast, duplicate key 11000, malformed JSON) are translated to the same
  shape. Unexpected errors are logged with stack trace but the client only sees a generic message in
  production. Every error response carries `requestId` to correlate with logs.

## D6. Environment validated with Zod at startup ("fail fast")

- A typo in `.env` stops the server immediately with a readable list of problems instead of failing
  in the middle of a request. Node's built-in `--env-file-if-exists` loads `.env` – no `dotenv` dependency.

## D7. pino for logging

- Structured JSON (machine-searchable) in production, pretty in development, silent in tests.
  Credentials (authorization header, cookies, password fields) are redacted.
- **Rejected:** winston – slower and more configuration for the same outcome here.

## D8. Transactions when available, graceful fallback otherwise

- MongoDB only supports multi-document transactions on a replica set. The local install is
  standalone, so `withTransaction()` detects support once and falls back to single-document atomic
  writes. The app is correct in both modes; enabling the replica set (README) upgrades consistency
  without code changes.

## D9. Uploaded files stored on disk, DB stores only the path

- Keeps MongoDB small and fast; files can be re-processed or downloaded later for auditing.
  In production this folder would become object storage (S3/GCS) – only the path format changes.
- **Rejected:** storing file bytes in MongoDB (GridFS) – unnecessary for files we only keep for reference.

## D10. Vite dev proxy for `/api`

- In development the browser only talks to `localhost:5173`; Vite forwards `/api` to Express.
  Same-origin requests mean no CORS preflights and the httpOnly refresh cookie works simply.
  CORS is still configured on the API for deployments where UI and API are on different origins.

## D11. Vitest for tests (server and client)

- Native ES-module support (Jest's ESM mode is still experimental), Jest-compatible API, fast.

## D12. Tailwind CSS for styling

- Fast to build a clean, responsive internal UI without writing and naming lots of custom CSS;
  brand colours are defined once as theme tokens.

## D13. Access token (JWT, 15 min) + rotating refresh token (httpOnly cookie, 7 days)

- **Access token** is stateless: verified by signature only, so normal requests need no DB lookup.
  It is short-lived, and it is kept in memory (Redux) on the client – never in localStorage, where
  any XSS could read it.
- **Refresh token** is a random opaque string in an **httpOnly, SameSite=Strict cookie** limited to
  `/api/auth`. JavaScript cannot read it (XSS-safe); other sites cannot make the browser send it (CSRF-safe).
  Only its SHA-256 hash is stored.
- **Rotation + reuse detection:** each refresh consumes the token (atomic `findOneAndUpdate`) and
  issues a new one in the same _family_. A rotated token presented again after a 30 s grace window
  means it was probably stolen, so the whole family is revoked. The grace window avoids logging
  people out when two browser tabs refresh at the same moment.
- **Trade-off:** a deactivated user's existing access token stays valid until it expires (≤ 15 min).
  Accepted for an internal tool; checking the DB on every request would remove that window at a cost.
- **Rejected:** server sessions (needs a session store), long-lived JWTs (cannot be revoked).

## D14. bcryptjs for password hashing (cost 12)

- Pure JavaScript, so `npm install` never needs a C++ build toolchain (a common failure on Windows).
  Same algorithm and hash format as native `bcrypt`, somewhat slower – irrelevant at login volumes.
- Login compares against a dummy hash when the email does not exist, so response time does not
  reveal which emails are registered, and every failure returns the same message.

## D15. Tests run against an in-memory MongoDB replica set

- `mongodb-memory-server` starts a throwaway **replica set** once per test run; each test file uses
  its own database name, so files run in parallel without interfering, and transaction code is
  exercised for real. The developer's database is never touched. A locally installed `mongod` is
  reused to avoid a 70 MB download.

## D16. Dates: stored as UTC, read as IST, own small parser (no date library)

- India has one timezone and no daylight saving, so IST is a fixed +05:30 offset – plain arithmetic
  is exact. A ~100-line parser handles every format we accept (DD-MM-YYYY, DD/MM/YYYY, 20-Oct-2026,
  ISO with/without offset, 12h/24h time, Excel date cells and serial numbers) and rejects impossible
  dates (31-02) that `new Date()` would silently roll over to 3 March.
- Day-first only: `03/04/2026` is 3 April. Supporting US month-first too would make such dates ambiguous.
- A date-only Expected Delivery Date means "by the end of that day", so it is stored as 23:59:59.999 IST.
- **Rejected:** `new Date(string)` (locale-dependent, accepts invalid dates), moment/luxon (heavy for this need).

## D17. Import semantics: what counts as an error, and what a re-upload does

- **Errors** (row → _needs correction_, never flagged by rules): a missing mandatory field, an
  unparseable/impossible/future date, wrong date order, an unknown status/payment type, a bad amount
  or phone number, a missing date that the status requires (DISPATCHED needs dispatch and expected
  delivery dates), or a dispatch date on an order that is "Confirmed" (contradictory – we can't tell which is true).
- **Rejected** (not stored): no Order ID, or the same Order ID twice in one file with _different_
  data – all copies are rejected because we cannot know which is correct. An _identical_ repeat
  is harmless: the first copy is kept.
- **Warnings** (imported anyway): unknown, ambiguous or inactive employee – the order is valid, the
  follow-up task just goes to an unassigned queue for the manager.
- An Order ID that already exists in the DB is an **update**, not a duplicate – daily files repeat
  orders with new statuses. A normalised-content hash makes identical re-uploads write nothing.
- **Bad data never overwrites good data:** an invalid row for an order already stored as VALID is
  reported but not applied.
- A missing required **column** fails the whole file (format error) – but the attempt is still
  recorded as a FAILED import batch for traceability.

## D18. Uploaded files: generated names, content sniffing, path stored in DB

- multer writes to `server/uploads/` under `<timestamp>-<random>.<ext>`; the user's filename is never
  used as a path (no path traversal, no collisions). The DB stores the relative path.
- The extension is checked on upload, then the **content** is checked: `.xlsx` must be a ZIP,
  `.csv` must not be binary. A renamed executable is rejected.
- A file whose request fails before an import record exists is deleted; once an import record
  exists, the file is kept because the record points to it.

## D19. Validation is a pure function

- `validateRow(row, { now, resolveEmployee })` and `validateRows` take plain data and return plain
  results – no database, no clock. Every rule has a unit test with a fixed `now`, and the import
  service just orchestrates: parse → map → validate → persist.

## D20. Override instead of downgrade for a vulnerable transitive dependency

- ExcelJS depends on an old `uuid` with a moderate advisory. `npm audit fix --force` would have
  _downgraded_ ExcelJS by a major version. Instead, an npm `overrides` entry pins `uuid@^11.1.1`;
  ExcelJS was re-tested and `npm audit` reports 0 vulnerabilities.
