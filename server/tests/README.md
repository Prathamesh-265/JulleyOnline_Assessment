# API and socket tests

Throwaway black-box suite. It talks to a **running** server over HTTP and Socket.IO, exactly like the client does, so it checks the real stack (routes, RBAC, Prisma, database constraints, sockets). Delete the whole `tests/` folder whenever you like; nothing else depends on it.

## Run

```bash
# terminal 1
npm install          # first time only (adds socket.io-client)
npm run dev

# terminal 2
npm test                 # everything
npm test -- 06           # only files whose name contains "06" (concurrency)
```

Set `API_URL` if the server isn't on `http://localhost:5000`:
PowerShell: `$env:API_URL="https://your-server"; npm test`

## What it does to your database

It never touches the seed data and never wipes anything. Each run:

1. registers 7 throwaway users (`qa-...@kanban-test.dev`),
2. creates two organizations with three tenants, runs the tests inside them,
3. deletes both organizations at the end (everything under them cascades away).

The users stay behind (there is no delete-user endpoint). They are harmless; remove them in the Neon SQL Editor if you want:

```sql
DELETE FROM users WHERE email LIKE 'qa-%@kanban-test.dev';
```

## Rate limits

The API allows 50 auth calls and 1000 requests per 15 minutes per IP. One run uses roughly 20 auth calls and several hundred requests, so after two runs in a row you may see 429s. Restart the server (`npm run dev`) to reset the limiter.

## Files

| File | Covers |
| --- | --- |
| `01-auth` | register, login, JWT checks (forged, expired, `alg: none`), security headers |
| `02-organizations-tenants` | org and tenant CRUD, members, multi-tenant users, cascades |
| `03-rbac` | Member / Tenant Admin / Org Admin permission matrix, member removal |
| `04-isolation` | cross-tenant and cross-org reads and writes all 404, tampering with tenant ids, assignee and column checks |
| `05-boards-columns-tasks` | board, column and task CRUD and validation |
| `06-concurrency` | version conflicts (409), simultaneous edits and drags, deleted-task edits, ordering with `afterId`, 45 inserts into one gap (renumbering) |
| `07-realtime` | socket auth, tenant rooms, every live event, presence (multi-tab), kicks on removal, tenant delete, reconnect behaviour |
| `08-activity` | log entries for each action, diffs, filters, limits, cursor paging, scoping |
| `helpers/` | API client, fixtures, socket helpers, test-world builder |
| `run.js` | builds the world, runs the files one at a time, cleans up |

## Not covered

Browser UI behaviour (drag animation, panels, toasts). Check that by hand with two browser windows.
