import { useEffect, useState } from "react";
import ActivityLog from "../components/collab/ActivityLog";
import ConnectionBanner from "../components/collab/ConnectionBanner";
import MembersPanel from "../components/collab/MembersPanel";
import KanbanBoard from "../components/board/KanbanBoard";
import BoardsNav from "../components/board/BoardsNav";
import TaskPanel from "../components/board/TaskPanel";
import EmptyWorkspace from "../components/layout/EmptyWorkspace";
import Navbar from "../components/layout/Navbar";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Loader, { BoardSkeleton } from "../components/ui/Loader";
import Toast from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import useActivity from "../hooks/useActivity";
import useBoard from "../hooks/useBoard";
import useRealtime from "../hooks/useRealtime";
import { api } from "../services/api";

export default function Workspace() {
  const { user } = useAuth();
  const ws = useWorkspace();
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [panel, setPanel] = useState(null); // 'activity' | 'members' | null
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activity = useActivity(ws.tenant?.id);
  const board = useBoard(ws.boardId, {
    members: ws.members,
    onNotice: setNotice,
    onGone: ws.reloadBoards,
    onBoardsChanged: ws.reloadBoards,
  });

  const realtime = useRealtime(
    ws.tenant?.id,
    {
      ...board.handlers,
      "activity:new": activity.push,
      "tenant:revoked": () => {
        setNotice("Your access to this branch was removed.");
        ws.reloadOrgs();
      },
    },
    // after a reconnect, anything could have happened: refetch instead of trusting local state
    () => {
      board.load();
      ws.reloadBoards();
      activity.load();
    },
  );

  // a different branch or board means the open panels no longer apply
  useEffect(() => {
    setSelectedId(null);
    setPanel(null);
  }, [ws.tenant?.id, ws.boardId]);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, unless the user is typing
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      )
        return;
      e.preventDefault();
      e.shiftKey ? board.redo() : board.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const deleteBoard = async () => {
    setDeleting(true);
    try {
      await api.del(`/boards/${ws.boardId}`);
      await ws.reloadBoards();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const selected =
    selectedId && board.board
      ? board.board.columns
          .flatMap((c) => c.tasks)
          .find((t) => t.id === selectedId)
      : null;
  // if the open task is deleted by someone else, the panel closes
  useEffect(() => {
    if (selectedId && board.board && !selected) setSelectedId(null);
  }, [selectedId, board.board, selected]);

  let content;
  if (ws.orgs === null) content = <Loader label="Loading your workspace" />;
  else if (!ws.org || !ws.tenant)
    content = <EmptyWorkspace onError={setNotice} />;
  else {
    content = (
      <div className="shell">
        <BoardsNav onError={setNotice} />
        <main className="main">
          {!ws.boardId ? (
            <div className="empty glass">
              <h2>No boards in {ws.tenant.name} yet</h2>
              <p className="muted">
                {ws.isAdmin
                  ? "Create the first one from the Boards list."
                  : "A tenant admin needs to create a board."}
              </p>
            </div>
          ) : !board.board ? (
            board.loading ? (
              <BoardSkeleton />
            ) : (
              <p className="center muted">Board not available.</p>
            )
          ) : (
            <>
              <div className="toolbar">
                <div>
                  <h1>{board.board.name}</h1>
                  {board.board.description && (
                    <p className="muted">{board.board.description}</p>
                  )}
                </div>
                <div className="toolbar-actions">
                  <button
                    className="btn ghost small"
                    onClick={board.undo}
                    disabled={!board.canUndo}
                    title="Undo (Ctrl+Z)"
                  >
                    ↶ Undo
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={board.redo}
                    disabled={!board.canRedo}
                    title="Redo (Ctrl+Shift+Z)"
                  >
                    ↷ Redo
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => setPanel("activity")}
                  >
                    Activity
                  </button>
                  {ws.isAdmin && (
                    <button
                      className="btn ghost small danger-text"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete board
                    </button>
                  )}
                </div>
              </div>
              <KanbanBoard
                board={board.board}
                isAdmin={ws.isAdmin}
                onOpen={setSelectedId}
                actions={board}
              />
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <ConnectionBanner
        online={realtime.online || !ws.tenant}
        wasOnline={realtime.wasOnline}
      />
      <Navbar users={realtime.users} onPanel={setPanel} onError={setNotice} />
      {content}

      {selected && (
        <TaskPanel
          key={selected.id}
          task={selected}
          columns={board.board.columns}
          members={ws.members}
          tenantId={ws.tenant.id}
          canDelete={ws.isAdmin || selected.createdBy === user.id}
          onSave={(id, changes, version) =>
            board.editTask(id, changes, { version })
          }
          onMove={board.moveToColumn}
          onDelete={async (id) => {
            await board.deleteTask(id);
            setSelectedId(null);
          }}
          onClose={() => setSelectedId(null)}
        />
      )}
      {panel === "activity" && (
        <ActivityLog items={activity.items} onClose={() => setPanel(null)} />
      )}
      {panel === "members" && ws.tenant && (
        <MembersPanel onClose={() => setPanel(null)} />
      )}

      {confirmDelete && board.board && (
        <ConfirmDialog
          title="Delete this board?"
          message={`"${board.board.name}" and all of its columns and tasks will be permanently removed for everyone in this branch.`}
          confirmLabel="Delete board"
          busy={deleting}
          onConfirm={deleteBoard}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      <Toast message={notice} onDone={() => setNotice("")} />
    </div>
  );
}
