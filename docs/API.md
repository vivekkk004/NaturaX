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
