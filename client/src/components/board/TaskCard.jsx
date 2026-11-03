import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dueInfo } from '../../utils/format';
import Avatar from '../ui/Avatar';

// What a card looks like. Also used for the floating copy while dragging.
export function CardFace({ task, done }) {
  const due = dueInfo(task.dueDate, done);
  return (
    <>
      <h4>{task.title}</h4>
      {task.description && <p>{task.description}</p>}
      <footer>
        <span className={`prio ${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span>
        {due && <span className={`due ${due.overdue ? 'late' : ''}`}>{due.text}</span>}
        <Avatar user={task.assignee} size={22} />
      </footer>
    </>
  );
}

export default function TaskCard({ task, done, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`task ${isDragging ? 'ghost' : ''}`}
      onClick={() => onOpen(task.id)}
      {...attributes}
      {...listeners}
    >
      <CardFace task={task} done={done} />
    </article>
  );
}
