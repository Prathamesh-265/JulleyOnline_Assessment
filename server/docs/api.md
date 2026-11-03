# API reference

Base URL `http://localhost:5000/api`. JSON in, JSON out.

**Auth:** every endpoint except `/health`, `/auth/register` and `/auth/login` needs `Authorization: Bearer <token>`.
**Tenant scoping:** the server works out the tenant from the resource (or checks the tenant you name against your memberships). You never get to choose a tenant you don't belong to.
**Roles** in the tables are the _minimum_ role: `Member` < `Tenant Admin` < `Org Admin`. An Org Admin of the tenant's organization counts as Org Admin on all its tenants.

## Errors

```json
{ "error": "Human readable message" }
```

| Status | When                                                                        |
| ------ | --------------------------------------------------------------------------- |
| 400    | Validation failed (`details: [{path, message}]`), bad id, invalid reference |
| 401    | Missing, forged or expired token; wrong login                               |
| 403    | You can see the resource but your role is too low                           |
| 404    | Doesn't exist **or you have no access to it** (deliberately the same)       |
| 409    | Version conflict, duplicate, or column not empty                            |
| 429    | Rate limited                                                                |

Task conflicts add machine-readable fields:

```json
// 409
{ "error": "Task was changed by someone else", "code": "VERSION_CONFLICT", "current": { "...latest task..." } }
// 404
{ "error": "Task was deleted by someone else", "code": "TASK_DELETED" }
```

## Auth

| Method | Path             | Auth | Body                                     | Returns               |
| ------ | ---------------- | ---- | ---------------------------------------- | --------------------- |
| POST   | `/auth/register` | no   | `{ name, email, password (8-72 chars) }` | 201 `{ user, token }` |
| POST   | `/auth/login`    | no   | `{ email, password }`                    | `{ user, token }`     |
| GET    | `/auth/me`       | yes  |                                          | `{ user }`            |

## Organizations

| Method | Path                 | Role          | Body       | Returns                                                                             |
| ------ | -------------------- | ------------- | ---------- | ----------------------------------------------------------------------------------- |
| POST   | `/organizations`     | any user      | `{ name }` | 201 org; caller becomes Org Admin                                                   |
| GET    | `/organizations`     | member of org |            | `[{ id, name, isOrgAdmin, tenants: [{ id, name, role }] }]` only what you can reach |
| GET    | `/organizations/:id` | member of org |            | one item of the above                                                               |
| PUT    | `/organizations/:id` | Org Admin     | `{ name }` | org                                                                                 |
| DELETE | `/organizations/:id` | Org Admin     |            | 204, cascades to everything below                                                   |

## Tenants

| Method | Path                           | Role                                             | Body / query                                  | Returns                                             |
| ------ | ------------------------------ | ------------------------------------------------ | --------------------------------------------- | --------------------------------------------------- |
| POST   | `/tenants`                     | Org Admin                                        | `{ organizationId, name }`                    | 201 tenant                                          |
| GET    | `/tenants?organizationId=`     | member of org                                    |                                               | tenants you can reach, with your role               |
| GET    | `/tenants/:id`                 | Member                                           |                                               | tenant                                              |
| PUT    | `/tenants/:id`                 | Tenant Admin                                     | `{ name }`                                    | tenant                                              |
| DELETE | `/tenants/:id`                 | Org Admin                                        |                                               | 204                                                 |
| GET    | `/tenants/:id/members`         | Member                                           |                                               | `[{ id, name, email, role }]` (includes org admins) |
| POST   | `/tenants/:id/members`         | Tenant Admin (Org Admin to grant `TENANT_ADMIN`) | `{ email, role: "MEMBER" \| "TENANT_ADMIN" }` | 201 member                                          |
| DELETE | `/tenants/:id/members/:userId` | Tenant Admin (Org Admin for a Tenant Admin)      |                                               | 204, member's sockets are removed from the room     |

## Boards

| Method | Path                  | Role         | Body / query                       | Returns                                                            |
| ------ | --------------------- | ------------ | ---------------------------------- | ------------------------------------------------------------------ |
| POST   | `/boards`             | Tenant Admin | `{ tenantId, name, description? }` | 201 board, created with To Do / In Progress / Testing / Done       |
| GET    | `/boards?tenantId=`   | Member       |                                    | boards of that tenant                                              |
| GET    | `/boards/:id`         | Member       |                                    | board with `columns[]`, each with `tasks[]`, both in display order |
| GET    | `/boards/:id/columns` | Member       |                                    | columns                                                            |
| PUT    | `/boards/:id`         | Tenant Admin | `{ name?, description? }`          | board                                                              |
| DELETE | `/boards/:id`         | Tenant Admin |                                    | 204, columns and tasks cascade                                     |

## Columns

| Method | Path           | Role         | Body                   | Returns                           |
| ------ | -------------- | ------------ | ---------------------- | --------------------------------- |
| POST   | `/columns`     | Tenant Admin | `{ boardId, name }`    | 201 column (appended)             |
| PUT    | `/columns/:id` | Tenant Admin | `{ name?, position? }` | column                            |
| DELETE | `/columns/:id` | Tenant Admin |                        | 204, or 409 if it still has tasks |

## Tasks

A task: `{ id, boardId, columnId, tenantId, title, description, assignedTo, assignee: {id,name}|null, createdBy, priority: LOW|MEDIUM|HIGH, dueDate, position, version, createdAt, updatedAt }`

| Method | Path              | Role                      | Body / query                                                                   | Returns                                     |
| ------ | ----------------- | ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| POST   | `/tasks`          | Member                    | `{ boardId, columnId, title, description?, assignedTo?, priority?, dueDate? }` | 201 task, added at the bottom of the column |
| GET    | `/tasks?boardId=` | Member                    |                                                                                | tasks of the board                          |
| GET    | `/tasks/:id`      | Member                    |                                                                                | task                                        |
| PUT    | `/tasks/:id`      | Member                    | `{ version, ...changed fields }`                                               | updated task, or 409                        |
| PATCH  | `/tasks/:id/move` | Member                    | `{ version, columnId, afterId? }`                                              | moved task, or 409                          |
| DELETE | `/tasks/:id`      | creator, or Tenant Admin+ |                                                                                | 204                                         |

Notes:

- `PUT` is a partial update: send only changed fields plus `version`. `assignedTo` must be a member of the tenant (or `null`). `dueDate` is an ISO date or `null`.
- `afterId` is the task the card should sit directly below in the target column. `null`/missing means top of the column. For the bottom, send the last task's id. The server resolves actual neighbours itself.
- Every successful write bumps `version` by 1. Send back the version you last saw.

Move example:

```http
PATCH /api/tasks/6f1c…/move
{ "version": 3, "columnId": "a0b4…", "afterId": "d93e…" }

200 { "id": "6f1c…", "columnId": "a0b4…", "position": 3072, "version": 4, … }
409 { "error": "Task was changed by someone else", "code": "VERSION_CONFLICT", "current": { … } }
```

## Activity

| Method | Path        | Role   | Query                                                                                         | Returns                                                                                     |
| ------ | ----------- | ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/activity` | Member | `tenantId` (required), `entityId?`, `limit?` (1-100, default 30), `before?` (ISO date cursor) | newest first: `[{ id, entityType, entityId, action, details, createdAt, user: {id,name} }]` |

Actions: `created`, `updated` (details has `changed: { field: {from,to} }`), `moved` / `reordered` (`from`, `to` column names), `deleted`.

## Health

`GET /health` → `{ "status": "ok" }`
