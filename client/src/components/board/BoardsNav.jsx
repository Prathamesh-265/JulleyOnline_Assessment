import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../services/api';
import InlineAdd from '../ui/InlineAdd';

// List of boards in the current branch. A strip on phones, a sidebar on desktop.
export default function BoardsNav({ onError }) {
  const { tenant, boards, boardId, selectBoard, reloadBoards, isAdmin } = useWorkspace();

  const create = async (name) => {
    try {
      const board = await api.post('/boards', { tenantId: tenant.id, name });
      await reloadBoards();
      selectBoard(board.id);
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <nav className="boards-nav" aria-label="Boards" data-lenis-prevent>
      <h3>Boards</h3>
      <ul>
        {boards.map((b) => (
          <li key={b.id}>
            <button className={b.id === boardId ? 'active' : ''} onClick={() => selectBoard(b.id)}>
              {b.name}
            </button>
          </li>
        ))}
      </ul>
      {isAdmin && <InlineAdd label="New board" placeholder="Board name" onSubmit={create} />}
    </nav>
  );
}
