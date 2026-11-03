# Syncboard: client

React + Vite frontend for the real-time collaborative Kanban board. It needs the [server](../server) running.

## Run it

Node 20+.

```bash
cd client
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:5000 (change if your server is elsewhere)
npm run dev               # http://localhost:5173
```

Start the server first (`npm run dev` in `server/`, after `db:migrate` and `db:seed`), then log in with a demo account, e.g. `priya@demo.test` / `Password@123`. Open a second browser (or a private window) as `arjun@demo.test` to watch changes sync live.

Build for production: `npm run build` (output in `dist/`). On Vercel set `VITE_API_URL` to the deployed server URL; `vercel.json` already rewrites routes to `index.html`. On the server, set `CLIENT_URL` to the deployed client origin.

## What's in it

| Area                                                                  | Where                                    |
| --------------------------------------------------------------------- | ---------------------------------------- |
| Landing page (GSAP intro, ScrollTrigger reveals, Lenis smooth scroll) | `pages/Landing.jsx`, `hooks/useLenis.js` |
| Login / register                                                      | `pages/Auth.jsx`                         |
| Organization selector, branch (tenant) switcher                       | `components/layout/Selectors.jsx`        |
| Kanban board with drag and drop (dnd-kit)                             | `components/board/*`                     |
| Task details panel with edit, delete and per-task history             | `components/board/TaskPanel.jsx`         |
| Presence, activity log, members, connection banner                    | `components/collab/*`                    |
| All board state: optimistic updates, conflicts, undo/redo             | `hooks/useBoard.js`                      |
| Socket join/reconnect logic                                           | `hooks/useRealtime.js`                   |
| REST client / socket client                                           | `services/api.js`, `services/socket.js`  |

```
src/
  components/  ui/ (Drawer, Toast, Avatar, InlineAdd)  layout/  board/  collab/
  pages/       Landing, Auth, Workspace
  context/     AuthContext, WorkspaceContext (org / branch / board selection)
  hooks/       useBoard, useRealtime, useActivity, useLenis
  services/    api, socket
  routes/      AppRoutes, ProtectedRoute
  styles/      global, landing, app (plain CSS)
```

## How the live parts work

- **Optimistic UI:** a drag updates the board immediately, then sends `PATCH /tasks/:id/move`. If the server rejects it, the card is replaced by the server's version (or the board is refetched) and a toast explains why.
- **Conflicts:** edits send the version the user started from. If someone else saved first the server answers 409; the panel keeps the user's text, shows "Updated by someone else" and offers _Load latest_.
- **Live events:** socket events update the board in place. An event older than what is already on screen is ignored.
- **Undo / redo:** buttons or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, for moves and field edits (task deletion can't be undone). Undo goes through the normal API. An edit is only reverted if the task still has the values this user set, so it never overwrites someone else's change.
- **Network recovery:** a banner shows while offline. On reconnect the client re-joins its branch room and refetches the board, boards list and activity, because events sent while offline are not replayed.
- **Branch switching:** the previous branch's boards, members and activity are cleared before the new branch's data loads, so nothing stale is shown.
- **Auth:** the JWT is kept in `localStorage` (simple, but readable by any script on the page; fine for this project, a production app would use an httpOnly cookie).

## Mobile

Boards swipe sideways with snap, a short press starts a drag on touch, drawers go full screen, and the navbar and board list collapse into scrollable strips. Motion is skipped for users who prefer reduced motion.

## Known limits

- Task deletion isn't undoable.
- No automated UI tests. The board, drag and undo flows were exercised in a headless browser against a mock API, not against the real server.
