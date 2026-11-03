# Real-Time Collaborative Kanban: Server

REST API + Socket.IO server for a multi-organization, multi-tenant Kanban board.
Express 5, PostgreSQL (Prisma), Socket.IO, JWT.

Docs: [API](docs/api.md) · [WebSocket events](docs/websocket.md) · [ER diagram](docs/database-erd.png) (source: [docs/database-erd.mmd](docs/database-erd.mmd))

## Run it

You need Node 20+ and a PostgreSQL database (local, or a free Neon/Supabase one).

```bash
cd server
npm install
cp .env.example .env      # set DATABASE_URL and JWT_SECRET (see below)
npm run db:migrate        # creates the 8 tables
npm run db:seed           # demo data. WIPES the database first
npm run dev               # http://localhost:5000
```

No Postgres yet? One-liner with Docker:

```bash
docker run --name kanban-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=collaborative_kanban -p 5432:5432 -d postgres:16
```

Check it's up: `curl http://localhost:5000/api/health`

### Environment variables

| Name             | Required | Notes                                                                                                     |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | yes      | Postgres connection string                                                                                |
| `JWT_SECRET`     | yes      | 32+ characters. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`                |
| `JWT_EXPIRES_IN` | no       | default `8h`                                                                                              |
| `PORT`           | no       | default `5000`                                                                                            |
| `CLIENT_URL`     | no       | allowed frontend origin(s), comma-separated. Used for CORS and Socket.IO. Default `http://localhost:5173` |

### Demo accounts (password `Password@123`)

| Email           | Organization                    | Tenant            | Role              |
| --------------- | ------------------------------- | ----------------- | ----------------- |
| rahul@demo.test | ABC Technologies                | all branches      | Org Admin         |
| priya@demo.test | ABC Technologies                | Hyderabad         | Tenant Admin      |
| arjun@demo.test | ABC Technologies, XYZ Solutions | Hyderabad, Mumbai | Member (two orgs) |
| sneha@demo.test | ABC Technologies                | Bangalore         | Tenant Admin      |
| kiran@demo.test | XYZ Solutions                   | Mumbai            | Member            |

### Deploying (Render + Neon)

Build command `npm install && npx prisma migrate deploy`, start command `npm start`. Set the env vars above, with `CLIENT_URL` pointing at the deployed frontend. Use Neon's direct (non-pooled) connection string for migrations. Socket.IO needs a host that allows long-lived connections.

## Architecture

```
src/
  config/       env validation (zod), prisma client
  middleware/   authenticate (JWT), errorHandler
  routes/       thin HTTP layer: parse input, call a service, send JSON
  services/     access.js (tenancy + roles), tasks.js (versioning, ordering), activity.js
  sockets/      Socket.IO: auth handshake, tenant rooms, presence
  utils/        ApiError, token helpers, uuid param check
prisma/         schema, migration, seed
```

A write, end to end (moving a task):

1. `PATCH /api/tasks/:id/move` → `authenticate` verifies the JWT and loads the user.
2. The service loads the task, then `requireRole` checks the user's membership for **that task's** tenant.
3. Version check, then one transaction: pick a position, update the row `WHERE version = ?`, write the activity log.
4. After commit, `announce()` emits `task:moved` and `activity:new` to the tenant's room.

Writes only happen over REST, so there is exactly one place where authorization runs. Sockets only deliver events.

## Tenancy model

- **Organization** = the company. **Tenant** = a branch/workspace inside it. They are separate because one org owns many tenants: an Org Admin spans all of them, everyone else sees only the tenants they were added to.
- **Memberships** link users to orgs/tenants with a role. `tenant_id = NULL` is an org-level membership, only valid for `ORG_ADMIN`, and covers every tenant of that org. A user can hold several memberships, across orgs too.
- **Where `tenant_id` comes from:** never from the client. Tasks/columns/boards take it from the parent row that was already access-checked (a task's tenant comes from its board). The only places a client names a tenant are "list/create in this tenant" calls, and those are checked against memberships before anything runs.
- **How it's validated:** `roleInTenant(userId, tenantId)` looks for a membership on that tenant or an org-level one in the tenant's own organization. Every route goes through it (`requireRole` / `loadScoped`).
- **How it's enforced:**
  1. Lookups go id → row → check the row's own `tenant_id` against the caller. A Bangalore task id from a Hyderabad user gets **404**, not 403, so ids can't be probed.
  2. Writes include `tenant_id` in the `WHERE`.
  3. The database backs this up with composite foreign keys: a task can't reference a board with a different tenant, or a column from another board; a board's organization must match its tenant's; a tenant membership must be in the tenant's org. See `prisma/migrations`.
  4. Assignees are checked to belong to the tenant.
- **Sockets:** a client can only enter a room through `tenant:join`, which runs the same membership check. Rooms are named `tenant:<id>`; events are emitted to one room only, after the commit. Removing a member (or deleting a tenant) pushes live sockets out of the room.
- **Cross-org:** an org's tenants are reachable only through memberships in that org. Membership in org A says nothing about org B.

## Roles

| Action                                                  |  Member  | Tenant Admin | Org Admin |
| ------------------------------------------------------- | :------: | :----------: | :-------: |
| See tenant, boards, tasks, members, activity            |    ✔     |      ✔       |     ✔     |
| Create / edit / move tasks                              |    ✔     |      ✔       |     ✔     |
| Delete tasks                                            | own only |     any      |    any    |
| Create / edit / delete boards and columns               |          |      ✔       |     ✔     |
| Rename tenant                                           |          |      ✔       |     ✔     |
| Add / remove Members                                    |          |      ✔       |     ✔     |
| Add / remove Tenant Admins                              |          |              |     ✔     |
| Create / delete tenants, edit / delete the organization |          |              |     ✔     |

Any signed-in user can create a new organization and becomes its Org Admin. Roles are checked on the server in every route; the UI hiding a button is only cosmetic.

## Database

Eight tables: `organizations`, `tenants`, `users`, `memberships`, `boards`, `columns`, `tasks`, `activity_logs`. Hierarchy: organization → tenants → boards → columns → tasks.

- `tenant_id` is on boards, columns, tasks and activity logs, indexed, and tied to the parent through composite keys (above).
- **Ordering:** `tasks.position` is a float. Dropping a card between two others writes one row (the midpoint). If a gap gets too small the column is renumbered and clients are told to refetch. Reads sort by `(position, id)`, so two cards that land on the same position still have one stable order.
- **Versioning:** `tasks.version` starts at 1 and goes up on every update or move. `updated_at` is kept too.
- **Activity logs:** written in the same transaction as the change they describe.
- Indexes: `memberships(user_id)`, `(tenant_id)`, `tasks(tenant_id)`, `tasks(column_id, position)`, `columns(board_id, position)`, `activity_logs(tenant_id, created_at desc)` and others, see the migration.
- Two rules Prisma can't express live in the migration SQL: a partial unique index for org-level memberships (NULLs are distinct in normal unique indexes) and a CHECK that `ORG_ADMIN` ⇔ `tenant_id IS NULL`.

## Real-time

Socket.IO. Handshake needs `auth: { token }`. Then `tenant:join` (with ack) → server verifies membership → socket joins `tenant:<id>`. Server pushes `task:created|updated|moved|deleted`, `board:updated`, `activity:new`, `presence:update`. Presence is an in-memory map of userId → sockets per tenant, so several tabs count as one user, and a dropped connection is noticed by Socket.IO's heartbeat. Full event list: [docs/websocket.md](docs/websocket.md).

**Network recovery:** Socket.IO reconnects by itself, but a reconnect is a brand-new socket with no room. The client must call `tenant:join` again on every `connect` and then refetch the board (`GET /api/boards/:id`), because events sent while it was offline are not replayed.

## Concurrency

- **Same task edited twice:** `PUT`/`PATCH` carry the `version` the client last saw. The update runs `WHERE id = ? AND version = ?`; Postgres row locking makes the second writer see 0 rows. Result: `409` with `code: VERSION_CONFLICT` and the current task, so the client can offer reload/retry.
- **Same task moved twice:** same path. First commit wins, second gets 409 with the winner's state.
- **Different tasks reordered at once:** the client sends "after task X" instead of an index. The server resolves real neighbours inside the transaction, so concurrent moves can't corrupt the order.
- **Edit vs delete:** editing a task that was just deleted returns `404` with `code: TASK_DELETED`.
- **Retries:** a retried write that already succeeded comes back as 409 (version moved on), so it can't be applied twice.
- **Undo/redo** is done in the client by sending the inverse operation (move back, restore old values) with the _current_ version. If someone else touched the task meanwhile it 409s and the undo is dropped instead of overwriting their work. The activity log stores old/new values to support this.

## Trade-offs

| Decision                                      | Why                                            | Cost                                                         |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Writes over REST only; sockets only broadcast | One authorization path, easy retries and tests | Slightly more latency than socket writes                     |
| Optimistic locking, reject on conflict        | Simple, predictable, no lost updates           | User has to retry; no field-level merge                      |
| Float positions                               | One-row moves                                  | Rare renumbering; floats aren't infinite                     |
| Composite foreign keys for tenancy            | Bugs in app code can't leak across tenants     | Schema is a bit harder to read                               |
| 404 for "not yours"                           | Doesn't confirm an id exists                   | Slightly harder debugging                                    |
| Single 8h access token                        | No refresh flow to build                       | Can't revoke a token before expiry; client must keep it safe |
| In-memory presence                            | No extra infrastructure                        | One server instance only (see below)                         |

## Security notes

bcrypt (cost 10) password hashing; JWT pinned to HS256; generic login error and equal-cost compare for unknown emails; Zod validation on every body/query; UUID check on every `:id`; Prisma parameterized queries (no raw SQL in the app); Helmet; CORS allowlist; rate limits (1000/15 min overall, 50/15 min on auth); 100 KB body limit; env validated at startup.

## Testing it by hand

With the seed data (Postman or curl, `Authorization: Bearer <token from /api/auth/login>`):

1. **Cross-tenant:** log in as `priya` (Hyderabad), take a Bangalore task id (log in as `sneha`, `GET /api/boards?tenantId=…` then the board), call `GET /api/tasks/<id>` → `404`.
2. **Cross-org:** as `kiran` call `GET /api/boards?tenantId=<a Hyderabad tenant id>` → `404`.
3. **Role check:** as `arjun` (Member) `POST /api/boards` → `403`; `POST /api/tenants` → `403`.
4. **Conflict:** `GET` a task (version 1), `PUT` it twice with `"version": 1` → second returns `409` with `current`.
5. **Socket isolation:** connect as `priya`, `tenant:join` a Bangalore tenant id → `{ ok: false }`.
6. **Real-time:** two sockets joined to Hyderabad, move a task via REST → both get `task:moved`.
7. **Reconnect:** drop a client's network, change something, reconnect → client must `tenant:join` + refetch.

## Known limitations

- Presence and rooms live in one process. To run several instances: Socket.IO Redis adapter + presence in Redis.
- Socket connections are authenticated once at handshake; an expired token doesn't drop an open socket (membership is re-checked on every join).
- No refresh tokens, email verification or password reset.
- Activity log has no retention/archival policy.
- No automated test suite; verification is manual (above).
- A task's description conflicts are whole-task, not merged per field.
