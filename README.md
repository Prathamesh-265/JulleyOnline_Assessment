# Syncboard

A real-time collaborative Kanban board for multi-organization, multi-tenant teams. Each organization has branches (tenants); every branch gets a private workspace of boards that updates live for everyone in it.

Built for the JulleyOnline FDE Intern assessment.

## Features

- **Multi-tenant by design:** Organization → Tenant → Board → Column → Task, with strict isolation at the API, socket and database layers.
- **Three roles:** Org Admin, Tenant Admin, Member, enforced on the server for every request.
- **Real-time sync:** task and board changes reach everyone in the same tenant over WebSockets. Presence shows who is online, across tabs.
- **Conflict-safe editing:** optimistic locking on every task. A stale edit or drag is rejected with 409 and the latest copy.
- **Drag and drop:** optimistic UI with server-side fractional ordering, safe under concurrent moves.
- **Undo / redo, activity log, network recovery:** undo goes through the normal API; reconnects re-join the tenant and refetch.
- **Responsive UI:** dark SaaS design with GSAP animation and Lenis smooth scrolling; works on phones.

## Tech stack

| Layer    | Tools                                                                |
| -------- | -------------------------------------------------------------------- |
| Client   | React 18, Vite, React Router, dnd-kit, GSAP, Lenis, Socket.IO client |
| Server   | Node 20, Express 5, Socket.IO, Zod, JWT, bcrypt, Helmet              |
| Database | PostgreSQL with Prisma (8 tables)                                    |

## Project layout

```
server/   Express API, sockets, Prisma schema + migration, docs/, tests/
client/   React app
```

## Getting started

Requirements: Node 20+ and a PostgreSQL database (a free Neon project or local Docker both work).

**Server**

```bash
cd server
cp .env.example .env        # set DATABASE_URL and JWT_SECRET (32+ characters)
npm install
npm run db:migrate
npm run db:seed             # demo data (wipes existing tables, so use a throwaway database)
npm run dev                 # http://localhost:5000
```

**Client**

```bash
cd client
cp .env.example .env        # VITE_API_URL=http://localhost:5000
npm install
npm run dev                 # http://localhost:5173
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

**Demo accounts** (password `Password@123`)

| Email           | Role                          |
| --------------- | ----------------------------- |
| rahul@demo.test | Org Admin (ABC Technologies)  |
| priya@demo.test | Tenant Admin (Hyderabad)      |
| arjun@demo.test | Member (Hyderabad and Mumbai) |
| sneha@demo.test | Tenant Admin (Bangalore)      |
| kiran@demo.test | Member (Mumbai)               |

Open two browsers with different accounts in the same branch to watch changes sync live.

## How it works

**Tenancy.** Access comes from memberships, never from an id the client sends. A membership with no tenant is an org-level Org Admin. Anything a user can't reach returns 404, so ids can't be probed. The database backs this up with composite foreign keys (for example, a task's tenant must match its board's tenant) and a CHECK constraint on org-level roles.

**Concurrency.** Every task has a `version`. Updates and moves run as `UPDATE ... WHERE id AND version`, so exactly one of several simultaneous writers succeeds; the rest get 409 with the current task. Ordering uses fractional positions, with automatic renumbering when the gap gets too small.

**Real-time.** All writes go through REST. Sockets only broadcast after the transaction commits. A socket joins a tenant room only after the same membership check as the REST API, and is removed from it when the membership is removed.

## Testing

With the server running, `npm test` in `server/` runs 116 API and socket tests against the live stack: auth, roles, isolation, CRUD, concurrency, ordering, real-time events and the activity log. It creates its own organizations and removes them afterwards. See `server/tests/README.md`.

## Documentation

- `server/docs/api.md`: REST reference
- `server/docs/websocket.md`: socket events and reconnect flow
- `server/docs/database-erd.png`: ER diagram (source in `database-erd.mmd`)

## Trade-offs and limits

- JWT lives in `localStorage` with an 8-hour expiry and no refresh token. A production app would use httpOnly cookies.
- Presence is held in memory, so it works on a single server instance. Several instances would need the Redis adapter.
- Undo and redo are client-side and cover moves and edits, not task deletion.
- UI behavior (drag animation, panels) is checked by hand, not by automated tests.
