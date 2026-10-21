# Architecture

## 1. System overview

A classic three-tier web application: a React single-page app talks JSON over HTTP to an Express
REST API, which stores everything in MongoDB. Uploaded files live on the server's disk; the DB keeps
only their path.

```mermaid
flowchart LR
  subgraph Browser
    UI[React SPA<br/>Redux Toolkit slices<br/>services/*.js axios]
  end
  subgraph API[Express API]
    MW[helmet · cors · json · pino-http · rate-limit]
    AUTH[authenticate · authorize role]
    VAL[validate zod]
    C[controllers]
    S[services<br/>business logic]
    RE[rule engine<br/>pure functions]
    EH[central error handler]
  end
  DB[(MongoDB)]
  FS[(server/uploads<br/>import files)]

  UI -- JSON + Bearer JWT --> MW --> AUTH --> VAL --> C --> S
  S --> RE
  S --> DB
  S --> FS
  C -. errors .-> EH
  S -. throws AppError .-> EH
```

## 2. Request lifecycle

1. **helmet** sets security headers; **cors** allows only the configured UI origin (with credentials
   so the refresh-token cookie travels).
2. **express.json** parses the body (1 MB limit; malformed JSON → 400).
3. **pino-http** assigns a request id (`X-Request-Id` header) and logs one line per request.
4. **rate limiter** caps requests per IP.
5. Route-level middleware: `authenticate` (JWT) → `authorize(role)` (RBAC) → `validate(zod)`.
6. **Controller** reads the validated input, calls a **service**, sends `{ data }` /
   `{ data, pagination }`.
7. Any thrown error (Express 5 forwards rejected promises automatically) reaches the **error
   handler**, which converts it into `{ error: { code, message, details, requestId } }`.

## 3. Layers and their responsibilities

| Layer       | Folder                      | Knows about HTTP? | Responsibility                                     |
| ----------- | --------------------------- | ----------------- | -------------------------------------------------- |
| Routes      | `modules/*/x.routes.js`     | yes               | URL + method → middleware chain → controller       |
| Controllers | `modules/*/x.controller.js` | yes               | Translate HTTP ⇄ service calls; no business rules  |
| Services    | `modules/*/x.service.js`    | **no**            | Business logic, transactions, audit writes         |
| Models      | `models/`                   | no                | Mongoose schemas, indexes, data-level invariants   |
| Rule engine | `rule-engine/`              | no, and no DB     | Pure `evaluate(orders, configs, now)` → exceptions |

Services throw `AppError` subclasses (`NotFoundError`, `ForbiddenError`, …) instead of writing
responses, so the same service can be called from an HTTP controller, a cron job or a script.

## 4. Folder structure

```
server/
├─ src/
│  ├─ app.js            builds the Express app (no listen → testable with supertest)
│  ├─ server.js         entry point: upload dir, DB connect, listen, graceful shutdown
│  ├─ routes.js         mounts every module under /api
│  ├─ config/           env.js (zod-validated env), db.js (connect + withTransaction),
│  │                    logger.js (pino), paths.js (upload folder)
│  ├─ constants/        roles, order statuses + synonyms, import issue codes
│  ├─ errors/           AppError hierarchy
│  ├─ import/           columns (header aliases), normalizers, parsers (CSV/XLSX),
│  │                    rowValidator (pure)
│  ├─ middleware/       auth (authenticate/authorize), validate, upload, rateLimiter,
│  │                    notFound, errorHandler
│  ├─ jobs/             ruleEvaluation.job.js (node-cron, every 15 min)
│  ├─ models/           User, RefreshToken, Order, ImportBatch, RuleConfig, Task,
│  │                    AuditLog (+ plugins/toJSON)
│  ├─ modules/          health, auth, users, imports, orders, rules, tasks (sync),
│  │                    audit (dashboard, reports added in later parts)
│  ├─ rule-engine/      BaseRule, rules/*.rule.js, registry, engine (pure), format
│  └─ utils/            dates (IST), pagination, tokens, validation
├─ scripts/             initReplicaSet.js, seedUsers.js (+ full seed, sample generator later)
├─ tests/               unit/ and integration/
└─ uploads/             uploaded files (git-ignored)

client/
├─ index.html · vite.config.js (dev proxy /api → :5000)
└─ src/
   ├─ main.jsx · App.jsx · index.css (Tailwind + brand theme)
   └─ services/         api.js (single axios instance) + one service per domain
   (store/, features/, components/, pages/, routes/, hooks/, utils/ added in Part 7)
```

## 5. Transactions strategy

`config/db.js` checks at startup whether MongoDB is a replica set (`hello.setName`).
`withTransaction(work)` then either runs `work(session)` inside a real transaction (all writes
commit or none) or – on a standalone server – runs `work(null)`, where each write is still atomic
for its own document. Callers always pass `{ session }` to Mongoose, which accepts `null`.

## 6. Import pipeline (Part 3)

```mermaid
flowchart TD
  U[POST /api/imports<br/>multipart file] --> M[multer: .csv/.xlsx, max 5 MB<br/>saved to server/uploads/ with a generated name]
  M --> B[ImportBatch created: PROCESSING<br/>stores only the file path]
  B --> P[parseFile: content sniffing<br/>CSV csv-parse / XLSX ExcelJS -> rows with row numbers]
  P --> H[mapHeaders: aliases -> canonical fields<br/>missing column -> whole file FAILED]
  H --> V[validateRows - pure, now injected<br/>normalise, validate, in-file duplicates]
  V --> O[persistOrders: upsert by orderId<br/>same hash -> skip, invalid never overwrites valid]
  O --> R[ImportBatch COMPLETED<br/>summary + row-by-row issues]
  R --> E[rule engine -> idempotent tasks<br/>taskSummary saved on the batch]
```

Orders and the batch summary are written in one `withTransaction` block; the rule engine then
runs over all relevant orders (not just this file's), so time-based rules stay current.

## 7. Rule engine and task sync (Part 4)

```mermaid
sequenceDiagram
  participant T as Trigger (import / cron / Run now)
  participant S as ruleEvaluation.service
  participant E as engine (pure)
  participant Y as taskSync.service
  participant DB as MongoDB
  T->>S: runRuleEvaluation({ now, actor })
  S->>DB: load ruleconfigs, mark SLA breaches
  S->>DB: cursor over relevant orders (chunks of 500)
  loop each chunk (one transaction)
    S->>E: evaluate(orders, rules, now)
    E-->>S: [{ order, exceptions }]
    S->>Y: syncTasks(evaluations)
    Y->>DB: upsert new tasks on unique (orderId, ruleType)
    Y->>DB: refresh / reopen / auto-resolve (conditional updates)
    Y->>DB: insert audit entries
  end
  S-->>T: summary { created, reopened, autoResolved, ... }
```

Details, the idempotency table and how to change or add a rule: [RULE_ENGINE.md](RULE_ENGINE.md).

## 8. Planned components (later parts)

- **Task APIs + audit APIs:** list/filter tasks, status changes, reassignment (transaction with
  audit), audit trail queries (Part 5).
- **Dashboard + daily CSV report** with server-side filters and streamed CSV (Part 6).
