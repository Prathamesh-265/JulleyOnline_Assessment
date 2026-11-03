# WebSocket reference (Socket.IO)

URL: same host and port as the API. Server → client events only carry data that is already committed to the database. **All writes go through the REST API**, never over the socket.

## Connecting and joining a tenant

```js
import { io } from "socket.io-client";

const socket = io(API_URL, { auth: { token } }); // JWT from /api/auth/login

function joinTenant(tenantId) {
  socket.emit("tenant:join", { tenantId }, (res) => {
    // { ok: true, role, users: [{id,name}] }  or  { ok: false, error }
  });
}

socket.on("connect", () => {
  // runs on first connect AND after every reconnect
  joinTenant(currentTenantId);
  refetchBoard(); // events sent while offline are not replayed
});
```

- **Authentication:** the handshake's `auth.token` is verified; a bad or expired token is refused with `connect_error: Unauthorized`.
- **Room authorization:** a socket is in a room only after `tenant:join` passes the same membership check as the REST API. Non-members and unknown tenants both get `{ ok: false, error: "Forbidden" }`. Clients cannot join rooms any other way.
- **One tenant per socket:** joining another tenant leaves the previous room first. Use `tenant:leave` to leave without joining.
- Rooms are named `tenant:<tenantId>`, and every event below goes to exactly one room.

## Client → server

| Event          | Payload        | Ack                                                  |
| -------------- | -------------- | ---------------------------------------------------- |
| `tenant:join`  | `{ tenantId }` | `{ ok: true, role, users }` / `{ ok: false, error }` |
| `tenant:leave` | none           | none                                                 |

## Server → client

| Event             | Payload                              | When                                                                                                                                        |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `task:created`    | `{ task, actorId }`                  | a task was created                                                                                                                          |
| `task:updated`    | `{ task, actorId }`                  | title/description/assignee/priority/due date changed                                                                                        |
| `task:moved`      | `{ task, fromColumnId, actorId }`    | moved between or within columns (`task.columnId`, `task.position`, `task.version` are the new values)                                       |
| `task:deleted`    | `{ id, boardId, columnId, actorId }` | a task was deleted                                                                                                                          |
| `board:updated`   | `{ boardId, action, actorId? }`      | `action`: `created`, `updated`, `deleted`, `columns` (column added/renamed/removed), `rebalanced` (positions renumbered: refetch the board) |
| `activity:new`    | activity log entry with `user`       | after any of the above                                                                                                                      |
| `presence:update` | `{ users: [{ id, name }] }`          | someone joined or left this tenant (full list, so it self-corrects)                                                                         |
| `tenant:revoked`  | `{ tenantId }`                       | you were removed from this tenant, or it was deleted. You've been taken out of the room                                                     |

`actorId` is the user who made the change, so a client can skip re-applying its own optimistic update (compare `task.version` with what you already have).

## Presence

The server keeps, per tenant, a map of user → open sockets. A user is online while at least one of their sockets is in the room, so several tabs count once and closing one tab doesn't mark them offline. Dropped connections are detected by Socket.IO's heartbeat (ping every 10 s, 8 s timeout).

## Reconnection

1. Socket.IO retries automatically (exponential backoff).
2. A reconnect is a fresh socket: it has **no room**. Re-emit `tenant:join` in the `connect` handler.
3. Refetch `GET /api/boards/:id` and replace local state, since missed events are lost.
4. Show a "reconnecting…" banner on `disconnect` / `connect_error`.

## Applying events on the client

- `task:created`: insert into its column unless the id already exists.
- `task:updated` / `task:moved`: replace the local task only if `incoming.version >= local.version`; then re-sort the column by `(position, id)`.
- `task:deleted`: remove by id.
- `board:updated` with `rebalanced`, `columns`, `deleted`: refetch.
