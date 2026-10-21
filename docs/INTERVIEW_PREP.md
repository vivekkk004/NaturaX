# Interview Preparation

## 0. The 30-second pitch

> "It's an internal tool that replaces checking order sheets by hand. A manager uploads the daily
> order file; every row is validated, bad rows are reported row by row and parked for correction.
> A rule engine checks every valid order against five rules – unconfirmed over 2 hours, not
> dispatched in 24 hours, late in transit, failed delivery, and high-value orders past their date.
> Each problem becomes a task with a reason, priority, action, owner and deadline. Managers see it
> all on a dashboard, reassign overdue work, download a daily report, and every change is in an
> append-only audit trail. Thresholds live in the database, so changing a rule is a setting, not a
> deploy, and re-uploading a file never creates duplicate tasks."

## 1. Before the interview – checklist

```bash
# MongoDB service running (Windows: Get-Service MongoDB)
cd NaturaX
npm run seed               # fresh demo state: orders, tasks (some overdue), activity, audit
npm run generate:sample    # fresh sample relative to NOW (prints the reference time)
npm run dev                # http://localhost:5173
npm test                   # be ready to show 133 green tests
```

- Logins: `manager@naturax.in / Manager@123`, `priya@naturax.in / Employee@123` (also rahul, anjali, arjun, sneha).
- Have open: the app, VS Code with `server/src/rule-engine/`, `docs/RULE_ENGINE.md`.
- Optional but impressive: enable the replica set (README) so `/api/health` shows `"transactions": true`.
- Keep `sample-data/orders_with_errors_demo.csv` ready for "upload a file with errors".

## 2. Five-minute demo script

| Time      | Show                                                                                                 | Say                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 0:00–0:30 | Login as manager → **Dashboard**                                                                     | the pitch above; point at the six tiles                                                                   |
| 0:30–1:15 | Dashboard: filters (exception type = Failed delivery, priority = High); click **Overdue tasks** tile | "Filters are server-side; tiles drill into the task list with the same filters."                          |
| 1:15–2:15 | **Import orders** → upload `orders_with_errors_demo.csv`                                             | "Bad rows don't stop the file: each gets a row number, field and reason; bad data never triggers a rule." |
| 2:15–2:45 | Upload the **same file again**                                                                       | "Unchanged 16, zero new tasks – duplicates are impossible by a unique index."                             |
| 2:45–3:30 | **Tasks** → open a task → Start working → Resolve with a note; show History                          | "Reason has real numbers; action is recommended; every step is audited."                                  |
| 3:30–4:15 | **Rule settings** → Dispatch delay 24 → 12 → Save → **Run rules now**                                | "Thresholds are data, validated per rule, audited – no deploy."                                           |
| 4:15–4:45 | Tasks → Overdue only → reassign to another employee                                                  | "Fresh deadline for the new owner, SLA breach kept, audited old → new, saved in one transaction."         |
| 4:45–5:00 | **Daily report** → Download CSV; **Audit trail**                                                     | "Five sections in one CSV, streamed; audit is append-only."                                               |

## 3. The five live challenges – step by step

### Challenge 1 – "Upload a new dataset containing errors"

1. Manager → **Import orders** → choose their file (CSV or XLSX) → **Upload and process**.
2. If their columns are named differently ("Order No", "Mobile", "EDD", "Amount"…) it still works –
   header aliases in `server/src/import/columns.js`.
3. If a required **column** is missing, the whole file is rejected with the list of missing
   columns (and still recorded in import history as FAILED).

### Challenge 2 – "Show how the system detects and handles those errors"

Point at the report on screen, then explain the three outcomes:

| Outcome              | When                                                                                                                                                                      | What happens                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Imported**         | row valid (warnings like unknown employee allowed)                                                                                                                        | order stored, rules evaluate it                                                                          |
| **Needs correction** | missing mandatory field, invalid/impossible/future date, wrong date order, bad phone/amount/status/payment, status needs a date that is missing, status contradicts dates | stored with its issues and raw values, **not flagged by rules** (PDF), gets a LOW "data correction" task |
| **Rejected**         | no Order ID, or the same Order ID twice in the file with different data                                                                                                   | not stored – we can't know which row is right                                                            |

Then show: **Orders** → filter _Data quality: Needs correction_ → open one → "Values as written in
the file". Bonus: fix a row in the CSV and re-upload → the data-correction task **auto-resolves** and
the real rules apply. Bad data never overwrites a valid order already stored (KEPT_PREVIOUS_VALID_DATA).

Code: `server/src/import/rowValidator.js` (pure function, `now` injected) – tests in
`server/tests/unit/rowValidator.test.js`.

### Challenge 3 – "Change a business rule: dispatch deadline 24 h → 12 h"

**UI (preferred):** Rule settings → _Dispatch delay_ → "Must dispatch within" = **12** → Save →
**Run rules now** → summary shows new `DISPATCH_DELAY` tasks for confirmed orders 12–24 h old.
Audit trail shows `thresholdHours: 24 → 12` with who and when.

**API:**

```bash
curl -X PATCH http://localhost:5000/api/rules/DISPATCH_DELAY -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" -d '{"params":{"thresholdHours":12}}'
curl -X POST http://localhost:5000/api/rules/evaluate -H "Authorization: Bearer $T"
```

**If they want it in code:** `server/src/rule-engine/rules/dispatchDelay.rule.js` →
`defaults.params.thresholdHours: 24`. Explain: code defaults only seed an empty database; after that
the `ruleconfigs` collection is the source of truth (so a manager's edit is never overwritten by a deploy).

What to say about existing tasks: tightening creates new tasks on the next evaluation; loosening does
**not** auto-close open tasks – a person is working on them.

### Challenge 4 – "How do you prevent duplicate tasks when the same file is uploaded again?"

Three layers – say them in this order:

1. **Database guarantee:** unique compound index `{ orderId: 1, ruleType: 1 }` on `tasks`
   (`server/src/models/Task.js`). Even two simultaneous uploads cannot create two tasks.
2. **Upsert instead of insert:** creation is `updateOne(filter={orderId, ruleType},
{ $setOnInsert: … }, { upsert: true })` (`server/src/modules/tasks/taskSync.service.js`) – an
   existing task is matched, never duplicated.
3. **Change detection:** each order has a `sourceHash` of its normalised content. Same file →
   same hash → order not even rewritten, tasks untouched. Tasks only change when the _data_ changes:
   resolved + data changed + still a problem → **reopen**; open + new data shows it's fixed →
   **auto-resolve**.

Demo: upload the same file twice → import report shows "Unchanged" and "Rule engine: 0 new tasks".
Tests: `rules.test.js` → "uploading the same file again creates no tasks and no audit entries" and
"concurrent evaluations still produce exactly one task".

### Challenge 5 – "What happens when an overdue task is reassigned?"

Demo: Tasks → tick **Overdue only** → open a task → the yellow note explains → pick another employee
→ **Reassign task**.

What happens (`server/src/modules/tasks/task.service.js → assignTask`):

1. Manager-only (`authorize(MANAGER)` on the route); resolved tasks can't be reassigned.
2. Because it was overdue, the new owner gets a **fresh deadline** = now + the rule's deadline
   hours (or an explicit one) – inheriting a past deadline is meaningless.
3. `slaBreached = true` is kept – the miss still counts in SLA metrics; reassignment doesn't hide it.
4. An audit entry `REASSIGNED` records old → new owner, old → new deadline and "overdue by 23h 21m".
5. Task update + audit entry run in **one transaction** (a test forces the audit insert to fail and
   proves the reassignment is rolled back). The update is conditional on the owner/status we read, so
   a concurrent change gives 409 instead of overwriting.
6. The task disappears from the old owner's list and appears in the new owner's (they can log in and see it).

## 4. Live code-change drills (practise these)

| They ask                                    | Where                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "Accept the status 'RTO' as failed"         | `server/src/constants/order.js` → `ORDER_STATUS_SYNONYMS`: `rto: ORDER_STATUS.DELIVERY_FAILED`  |
| "Accept column 'Mobile No.'"                | already: `columns.js` aliases (`mobileno`); add more to the `phone` list                        |
| "Make failed delivery due in 2 hours"       | UI Rule settings → Task deadline 2, or `PATCH /rules/FAILED_DELIVERY {"deadlineHours":2}`       |
| "High-value threshold ₹10,000"              | Rule settings → High-value → 10000                                                              |
| "Add a new rule"                            | `docs/RULE_ENGINE.md` §6: new class + constant + registry line + test                           |
| "Priority of unconfirmed COD orders = High" | a new rule class (COD-specific) or change the rule's `buildException` to raise priority for COD |
| "Show only my tasks to employees"           | already enforced server-side in `taskQuery.js` (`assignedTo = user.id` applied last)            |

After any change: `npm test` (rule tests run in ~1 s: `npx vitest run tests/unit --root server`).

## 5. Likely questions and answers

### Architecture

**Why routes → controllers → services → models?** Each layer has one job: routes wire middleware,
controllers translate HTTP, services hold business rules and never touch `req/res` (so the cron job
and seed script reuse them), models own schemas and indexes.

**Why no repository layer?** Mongoose models already are the data-access layer; a repository that
only forwards calls adds files without value. The code that needs isolation – the rule engine and row
validator – is pure (no DB at all).

**Why is the rule engine "pure"?** No clock, no DB: `evaluate(orders, rules, now)`. Same input → same
output, so rules are unit-tested with a fixed `now`, demos are reproducible with `asOf`, and the
same function serves import, scheduler and manual runs.

**Why a scheduler?** Rules depend on time passing; without it an order would only be flagged at the
next upload.

**Exception vs task – why one collection?** They are 1:1; one collection avoids joins and keeps
idempotency to one unique index.

### Database

**Which indexes and why?** Unique `orderId` (orders), unique `{orderId, ruleType}` (tasks,
idempotency), `{assignedTo, status, deadline}` (my tasks / workload), `{status, deadline}` (overdue),
`{ruleType, priority, status}` (category/priority widgets), `{detectedAt}` (daily "new"), audit by
order/task/time. Rule: every filter/sort field has an index; every business key is unique.

**Why is "overdue" not stored?** It depends on the current time; storing it would go stale. It's a
query (`status ≠ RESOLVED AND deadline < now`) and a virtual `isOverdue` in responses. What _is_
stored is the fact that the SLA was breached (`slaBreached`), which never changes back.

**Transactions?** Used where several writes must succeed together (task change + audit, import
orders + report). They require a replica set; the code detects support at startup and falls back to
single-document atomic writes on a standalone server.

**Why snapshot customer data on the task?** Lists, filters and the CSV report need it without a
join; it's refreshed whenever the order data changes.

### Import / validation

**How do you detect duplicates?** Within a file: group rows by normalised Order ID; identical repeats
→ keep the first; conflicting repeats → reject all. Against the DB: an existing Order ID is an
**update** (daily files repeat orders with new statuses), unchanged content is skipped by hash.

**How are dates handled?** Stored UTC, read as IST (fixed +05:30, no DST in India), day-first
formats, Excel date cells and serials, impossible dates (31-02) rejected – `new Date()` would roll
them over silently. A date-only expected delivery means end of that day.

**File security?** Extension whitelist + size limit (multer), content sniffing (xlsx must be a ZIP,
csv must not be binary), generated filenames (no path traversal), 10 000-row cap, only the path is
stored in MongoDB.

### Auth / security

**JWT flow?** 15-minute access token in memory (never localStorage); 7-day refresh token in an
httpOnly, SameSite=Strict cookie scoped to `/api/auth`, stored hashed, rotated on every use; reuse of
an old token after 30 s revokes the whole session family (theft detection).

**RBAC?** `authenticate` (who) then `authorize(role)` (what). Employees' scope is forced in the
service query, so a crafted URL can't widen it; another user's task returns 404 (no existence leak).

**Other hardening?** helmet headers, CORS whitelist, rate limits (global + login), bcrypt cost 12,
Zod validation everywhere, escaped regex search, pinned JWT algorithm, secrets only in env, generic
login error with constant-time comparison, redacted logs.

### Frontend

**Why Redux Toolkit with createAsyncThunk (not RTK Query)?** It was the requirement and it makes the
data flow explicit (pending/fulfilled/rejected visible). RTK Query would remove boilerplate and add
caching – a reasonable next step.

**How do you avoid stale results when filters change quickly?** Each list slice stores the latest
thunk `requestId`; older responses are ignored.

**How does the token refresh work?** An axios response interceptor catches `TOKEN_EXPIRED`, runs one
shared refresh for all failing requests (single-flight), retries them; if refresh fails, the store
resets and the user goes to login.

**A bug you found?** React StrictMode ran session restore twice with the same single-use refresh
token; the losing request could log the user out. Fixed with a thunk `condition` so restore only runs
from `idle` – found by driving the UI in headless Edge.

### Testing / quality

**What's tested?** 133 tests: rule boundaries (exactly 2 h doesn't fire), the 24→12 change, date
parsing, validation of every error type, CSV/XLSX parsing, re-upload idempotency, concurrency, task
lifecycle (reopen / auto-resolve), RBAC, transitions, transaction rollback, dashboard numbers per
filter, CSV report content, sample-data counts at several times of day, Redux slices.

**How do tests avoid your real DB?** mongodb-memory-server starts an in-memory **replica set** (so
transactions are tested for real); each test file uses its own database.

### Scaling / "what would you do next?"

Notifications (email/WhatsApp digest), courier/marketplace integrations instead of file upload,
background job queue for big imports, a single scheduler worker for multi-instance, S3 for files,
historical report from the audit log, RTK Query, Playwright tests in CI.

## 6. Numbers worth remembering

| Fact                               | Value                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Rules (PDF) / with data correction | 5 / 6                                                                                 |
| Thresholds                         | 2 h · 24 h · EDD passed · failed · > ₹5,000                                           |
| Task deadlines (defaults)          | 4 h · 8 h · 24 h · 4 h · 4 h · 24 h                                                   |
| Scheduler                          | every 15 min, IST                                                                     |
| Access / refresh token             | 15 min / 7 days (rotated)                                                             |
| Upload limits                      | 5 MB, 10 000 rows, .csv/.xlsx                                                         |
| Sample file                        | 121 rows → 116 orders, 14 need correction, 3 rejected, 2 duplicates skipped, 64 tasks |
| Tests                              | 118 server + 15 client                                                                |
