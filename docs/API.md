# API Reference

Base URL: `http://localhost:5000/api` (through the UI dev server: `http://localhost:5173/api`).

## Conventions

- **Auth:** `Authorization: Bearer <accessToken>` on every endpoint except health, login, refresh, logout.
- **Single resource:** `200 { "data": { ... } }`
- **List:** `200 { "data": [ ... ], "pagination": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 } }`
  - Query: `page` (≥ 1, default 1), `limit` (1–100, default 20), `sort` (`field` asc / `-field` desc, whitelisted per endpoint)
- **Error:** `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...], "requestId": "uuid" } }`

| Status | `code` values                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR` (details = `[{ location, field, message }]`), `BAD_REQUEST`                                       |
| 401    | `UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `NO_REFRESH_TOKEN`, `INVALID_REFRESH_TOKEN` |
| 403    | `FORBIDDEN` (authenticated but role not allowed)                                                                     |
| 404    | `NOT_FOUND`                                                                                                          |
| 409    | `CONFLICT` (duplicate)                                                                                               |
| 413    | `PAYLOAD_TOO_LARGE`                                                                                                  |
| 429    | `RATE_LIMITED`                                                                                                       |
| 500    | `INTERNAL_ERROR`                                                                                                     |

---

## Health

### `GET /health` – public

`200` (or `503` if the DB is down)

```json
{
  "data": {
    "status": "ok",
    "database": "connected",
    "transactions": false,
    "uptimeSeconds": 42,
    "timestamp": "2026-10-21T05:30:00.000Z"
  }
}
```

---

## Auth

### `POST /auth/login` – public (rate limited: 10 failed attempts / 15 min / IP)

```json
{ "email": "manager@naturax.in", "password": "Manager@123" }
```

`200` – also sets cookie `refreshToken` (httpOnly, SameSite=Strict, Path=/api/auth, 7 days)

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "6716...",
      "name": "Meera Nair",
      "email": "manager@naturax.in",
      "employeeCode": "MGR001",
      "role": "MANAGER",
      "isActive": true
    }
  }
}
```

`401 INVALID_CREDENTIALS` – same response for wrong password, unknown email or deactivated account.

### `POST /auth/refresh` – cookie only

Consumes the refresh cookie, returns a new access token and sets a new refresh cookie (rotation).
Same body as login. `401 INVALID_REFRESH_TOKEN` if the token is expired, revoked or reused; reuse
of an already-rotated token more than 30 s later revokes every session of that login.

### `POST /auth/logout` – cookie only

Revokes the refresh token, clears the cookie. `204 No Content`.

### `GET /auth/me` – any authenticated user

`200 { "data": { ...user } }`

---

## Users – **Manager only**

### `GET /users`

Query: `page`, `limit`, `sort` (`name`, `email`, `employeeCode`, `createdAt`, prefix `-` for desc;
default `name`), `role` (`MANAGER`|`EMPLOYEE`), `isActive` (`true`|`false`), `search` (name, email or code).

```
GET /api/users?role=EMPLOYEE&isActive=true&limit=2
```

```json
{
  "data": [
    {
      "id": "6716...",
      "name": "Anjali Menon",
      "email": "anjali@naturax.in",
      "employeeCode": "EMP003",
      "role": "EMPLOYEE",
      "isActive": true
    }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 5, "totalPages": 3 }
}
```

### `GET /users/:id`

`200 { "data": user }` · `404` unknown id · `400` malformed id

### `POST /users`

```json
{
  "name": "Kavya Iyer",
  "email": "kavya@naturax.in",
  "employeeCode": "EMP006",
  "password": "Welcome123",
  "role": "EMPLOYEE"
}
```

Password: 8–72 chars, at least one letter and one number. `201 { "data": user }` ·
`409 CONFLICT` with `details: { "field": "email" | "employeeCode" }`.

### `PATCH /users/:id`

Any of `name`, `role`, `isActive`, `password`. Deactivating a user or resetting their password
revokes all their sessions. A manager cannot deactivate or change the role of their own account (`400`).

---

## Imports – **Manager only**

### `POST /imports` – upload an order file

`multipart/form-data`:

| Field  | Required | Notes                                                                                    |
| ------ | -------- | ---------------------------------------------------------------------------------------- |
| `file` | yes      | `.csv` or `.xlsx`, ≤ 5 MB (configurable), ≤ 10 000 data rows                             |
| `asOf` | no       | "current time" for evaluation, e.g. `2026-10-20T18:00` (IST) – deterministic demos/tests |

```bash
curl -X POST http://localhost:5000/api/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample-data/orders_with_errors_demo.csv"
```

`201` – the import report:

```json
{
  "data": {
    "id": "6716…",
    "originalName": "orders_with_errors_demo.csv",
    "filePath": "uploads/1792561423105-787a65f12b7c.csv",
    "fileType": "csv",
    "status": "COMPLETED",
    "summary": {
      "totalRows": 20,
      "created": 16,
      "updated": 0,
      "unchanged": 0,
      "needsCorrection": 10,
      "rejected": 3,
      "duplicatesSkipped": 1,
      "keptPreviousValid": 0,
      "warnings": 1
    },
    "rowIssues": [
      {
        "row": 6,
        "orderId": "DEMO-1005",
        "field": "Order Date",
        "code": "INVALID_DATE",
        "message": "Order Date \"31-02-2026 10:00\" is not a valid date (expected DD-MM-YYYY HH:mm or YYYY-MM-DD HH:mm)",
        "severity": "ERROR",
        "outcome": "NEEDS_CORRECTION"
      }
    ],
    "uploadedBy": "6716…"
  }
}
```

Row `outcome`: `IMPORTED` · `NEEDS_CORRECTION` (stored, not evaluated by rules) · `REJECTED`
(no Order ID / conflicting duplicate – not stored) · `SKIPPED_DUPLICATE` (identical repeat).

Issue `code`s: `MISSING_FIELD, INVALID_ORDER_ID, INVALID_DATE, FUTURE_DATE, DATE_SEQUENCE,
INVALID_STATUS, STATUS_DATE_CONFLICT, INVALID_PAYMENT_TYPE, INVALID_AMOUNT, INVALID_PHONE,
INVALID_TEXT, DUPLICATE_IN_FILE` (errors) and `DUPLICATE_ROW, UNKNOWN_EMPLOYEE, AMBIGUOUS_EMPLOYEE,
INACTIVE_EMPLOYEE, KEPT_PREVIOUS_VALID_DATA` (warnings).

File-level failures (whole file rejected, batch saved as `FAILED`, `details.importBatchId` returned):

| Status | When                                                                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | wrong extension (`.txt`, `.xls`), content doesn't match extension, empty file, no data rows, > 10 000 rows, missing/duplicate required columns (`details.missingColumns`), no file, invalid `asOf` |
| 413    | file larger than `MAX_UPLOAD_SIZE_MB`                                                                                                                                                              |

### `GET /imports`

Import history (without `rowIssues`). Query: `page`, `limit`, `sort` (`createdAt`, `originalName`;
default `-createdAt`), `status` (`PROCESSING`|`COMPLETED`|`FAILED`).

### `GET /imports/:id`

Full report including `rowIssues`.

### `GET /imports/:id/file`

Downloads the originally uploaded file (with its original name).

---

## Orders – Manager (all orders) / Employee (only orders assigned to them)

### `GET /orders`

| Query                | Notes                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `dataStatus`         | `VALID` \| `NEEDS_CORRECTION` (the data-correction bucket)                                       |
| `status`             | canonical order status                                                                           |
| `paymentType`        | `PREPAID` \| `COD`                                                                               |
| `assignedTo`         | user id, or `unassigned` (manager only – ignored for employees)                                  |
| `dateFrom`, `dateTo` | order-date range, inclusive whole IST days, e.g. `2026-10-01`                                    |
| `search`             | order ID, customer name or phone (partial, case-insensitive)                                     |
| `sort`               | `orderDate`, `orderValue`, `orderId`, `expectedDeliveryDate`, `updatedAt` (default `-orderDate`) |

```
GET /api/orders?dataStatus=NEEDS_CORRECTION&sort=orderId&limit=10
```

### `GET /orders/:id`

`404` for an unknown order – and also for an employee asking for someone else's order (existence is not revealed).

---

## Rules – **Manager only**

### `GET /rules`

All rules with their live configuration, in evaluation order.

```json
{
  "data": [
    {
      "ruleType": "DISPATCH_DELAY",
      "label": "Dispatch delay",
      "description": "Confirmed order not dispatched within the threshold after it was placed.",
      "paramFields": [
        { "key": "thresholdHours", "label": "Must dispatch within", "unit": "hours" }
      ],
      "enabled": true,
      "params": { "thresholdHours": 24 },
      "priority": "MEDIUM",
      "deadlineHours": 8,
      "action": "Escalate to the warehouse to pack and dispatch today. ...",
      "updatedBy": null,
      "updatedAt": "2026-10-21T06:20:00.000Z"
    }
  ]
}
```

### `GET /rules/:ruleType`

One rule. Unknown `ruleType` → `400`.

### `PATCH /rules/:ruleType`

Any of `enabled` (bool), `params` (object of numbers – partial, merged), `priority`
(`HIGH|MEDIUM|LOW`), `deadlineHours` (0.25–720), `action` (5–500 chars).

```json
{ "params": { "thresholdHours": 12 } }
```

`200` with the updated rule. `400` with `details[].field = "params.thresholdHours"` for an invalid
or unknown parameter. Every effective change writes a `RULE_UPDATED` audit entry with old → new values.
Takes effect on the next evaluation.

### `POST /rules/evaluate`

Runs the rule engine over all relevant orders now. Body (optional): `{ "asOf": "2026-10-20T18:00" }`.

```json
{
  "data": {
    "asOf": "2026-10-21T06:23:09.300Z",
    "evaluatedOrders": 16,
    "created": 1,
    "reopened": 0,
    "autoResolved": 0,
    "refreshed": 0,
    "unchanged": 16,
    "createdByRule": { "DISPATCH_DELAY": 1 },
    "durationMs": 41
  }
}
```

### Import response – `taskSummary`

`POST /imports` runs the rule engine right after a successful import and includes the same
summary as `data.taskSummary`. If the evaluation itself fails, the import still succeeds and
`data.ruleEvaluationError` explains that rules should be run again.
