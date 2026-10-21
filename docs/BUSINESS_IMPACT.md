# Business Impact

The PDF asks five questions for the demo. Each answer below points to the feature that delivers it,
so it can be shown on screen, not just claimed.

## 1. How the system reduces manual work

| Manual today (Excel + WhatsApp)                                          | With the system                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Someone scrolls the day's sheet and checks each order's status and dates | One upload; the rule engine checks **every** order against all five rules in well under a second                    |
| Working out "is this late?" by mental date arithmetic                    | Rules compare timestamps exactly (IST-aware) and write the reason with numbers: "unconfirmed for 5h 12m (limit 2h)" |
| Deciding what to do with each problem                                    | Every exception carries a **recommended action** ("call the customer, request a re-attempt…")                       |
| Messaging colleagues to hand out follow-ups                              | Tasks are **assigned automatically** from the sheet's "Assigned Employee" column                                    |
| Chasing people for updates                                               | Status lives on the task (Open → In progress → Resolved) – the dashboard shows it live                              |
| Spotting bad rows (missing phone, wrong date) by eye                     | The importer lists them **row by row** and routes them to a data-correction task                                    |
| Building the daily summary by hand                                       | **Daily report** – one click, CSV download                                                                          |
| Re-checking yesterday's open issues                                      | Tasks persist; when a new sheet shows an order is delivered, its task **auto-resolves**                             |

People still do the follow-up calls – the system removes the searching, sorting, distributing and
reporting around them.

## 2. How it prevents orders from being forgotten

1. **Every exception becomes a task with an owner and a deadline.** No task is ever just a row in
   a sheet that someone might not scroll to.
2. **Nothing disappears silently.** Tasks are closed only by a person (with a note) or by the
   system when new data proves the problem is gone – both recorded in the audit trail. Loosening a
   rule never auto-closes open work.
3. **Time is watched continuously.** A scheduler re-runs the rules every 15 minutes, so an order
   that _becomes_ "unconfirmed for more than 2 hours" is flagged even if no new file is uploaded.
4. **Overdue work is visible to the manager** – overdue counter, red highlighting, employee-wise
   workload – and can be reassigned in two clicks (the new owner gets a fresh deadline; the SLA
   miss stays on record).
5. **Unowned and bad-data orders have a queue too.** An unknown employee code produces an
   **Unassigned** task; invalid data produces a **data-correction** task – so these edge cases,
   which are the easiest to forget, are explicitly tracked.
6. **Re-uploading never creates duplicate noise** (unique order + rule key), so people trust the
   list and don't start ignoring it.
7. **A resolved problem that comes back reopens** its task (e.g. a second delivery attempt fails).

## 3. Metrics that show whether the system is effective

All of these can be computed from data the system already stores (`tasks`, `auditlogs`, `orders`).

| Metric                                 | How it is computed                                                    | Good direction |
| -------------------------------------- | --------------------------------------------------------------------- | -------------- |
| **SLA compliance**                     | resolved tasks with `slaBreached = false` ÷ all resolved tasks        | ↑              |
| **Overdue tasks** (and their age)      | unresolved tasks with `deadline < now` (dashboard tile)               | ↓              |
| **Mean time to resolve**, per rule     | `resolvedAt − detectedAt`                                             | ↓              |
| **Mean time to first action**          | first STATUS_CHANGED audit entry − TASK_CREATED                       | ↓              |
| **Failed deliveries recovered**        | failed-delivery tasks whose order later became DELIVERED (not RTO)    | ↑              |
| **RTO rate (returns to origin)**       | from order statuses over time; follow-up should lower it              | ↓              |
| **Unconfirmed → confirmed conversion** | unconfirmed-order tasks whose order became CONFIRMED                  | ↑              |
| **Reopen rate**                        | tasks with `reopenCount > 0` ÷ resolved tasks (quality of resolution) | ↓              |
| **Data-quality rate**                  | rows needing correction ÷ rows imported (from import reports)         | ↓              |
| **Unassigned tasks**                   | tasks with `assignedTo = null` (mapping gaps in the sheet)            | → 0            |
| **Workload balance**                   | open tasks per employee (dashboard chart) – spread, not one person    | even           |
| **Adoption**                           | % of tasks touched by a human before their deadline                   | ↑              |

The business outcome these lead to: fewer cancelled/returned COD orders, fewer "where is my order"
complaints, faster delivery of high-value orders.

## 4. How to estimate the time saved per day

**Method:** measure a baseline, then compare – don't guess.

1. **Baseline week (before):** the team logs the minutes spent on (a) scanning sheets for problems,
   (b) coordinating on WhatsApp/phone about who handles what, (c) compiling the daily summary,
   (d) re-checking previous days' open issues.
2. **After go-live:** the same people log upload + dashboard review time. The system itself records
   when tasks were created, started and resolved (audit trail), which gives the action times exactly.
3. **Saved time = baseline − after**, per day, averaged over a few weeks.

**Worked example (illustrative assumptions, to be replaced by the baseline measurement):**

| Activity (per day)                      | Before                | After                           |
| --------------------------------------- | --------------------- | ------------------------------- |
| Check 300 orders × 30 s                 | 150 min               | 0 (rule engine)                 |
| Decide + hand out 40 exceptions × 3 min | 120 min               | 0 (auto-assigned)               |
| Daily summary report                    | 30 min                | 1 min (download)                |
| Re-check yesterday's open issues        | 20 min                | 0 (tasks persist, auto-resolve) |
| Upload file + review dashboard          | –                     | 10 min                          |
| **Total**                               | **≈ 320 min (5.3 h)** | **≈ 11 min**                    |

≈ 5 hours of coordination work saved per day in this example – time that moves to actually calling
customers and couriers. The formula scales: `saved ≈ orders × t_check + exceptions × t_coordinate

- t_report + t_recheck − t_upload_review`.

## 5. Limitations of the current version

| Limitation                                                                                                      | Possible next step                                                      |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Data arrives by **file upload**; no live connection to the store, courier or WhatsApp (not required by the PDF) | Webhooks / scheduled pulls from Shopify, courier tracking APIs          |
| **No notifications** – people must open the app to see new or overdue tasks                                     | Email/WhatsApp/Slack digest of new + overdue tasks per employee         |
| Dispatch delay is measured from the **order date** (the sheet has no "confirmed at" time)                       | Add a confirmation timestamp column                                     |
| The daily report's "unresolved/overdue" sections are a **snapshot of now**, not "as it was on date X"           | Rebuild historical state from the audit log (event sourcing)            |
| Rule changes apply to the **next** evaluation; existing tasks keep the priority/deadline they were created with | Optional "re-apply to open tasks" action                                |
| One server process runs the scheduler; scaling to several instances needs a single worker or lock               | Separate worker / job queue (BullMQ) or a distributed lock              |
| Uploaded files are on the server's disk                                                                         | Object storage (S3) for multi-instance deployments                      |
| Local MongoDB runs standalone → transactions fall back to single-document atomic writes                         | Enable the single-node replica set (README) – Docker setup already does |
| Only two roles (Manager, Employee); no teams, regions or escalation chain                                       | Team-based scoping, automatic escalation of long-overdue tasks          |
| No self-service password reset / SSO                                                                            | Email reset flow or company SSO                                         |
| IST and day-first dates are assumed                                                                             | Per-company timezone and date-format settings                           |
| Browser end-to-end tests were run manually (headless Edge), not in CI; Docker files not executed                | Playwright suite in CI; build the image in CI                           |
| Audit log is append-only at application level; a DB administrator could still alter it                          | DB roles without update/delete on `auditlogs`, or WORM storage          |
