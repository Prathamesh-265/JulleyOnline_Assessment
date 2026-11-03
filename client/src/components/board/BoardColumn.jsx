import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import InlineAdd from '../ui/InlineAdd';
import TaskCard from './TaskCard';

export default function BoardColumn({ column, isLast, onOpen, onAddTask }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section className={`column ${isOver ? 'over' : ''}`}>
      <header>
        <h3>{column.name}</h3>
        <span className="count">{column.tasks.length}</span>
      </header>
      <div className="column-body" ref={setNodeRef}>
        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} done={isLast} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>
      <InlineAdd label="Add task" placeholder="Task title" onSubmit={(title) => onAddTask(column.id, title)} />
    </section>
  );
}
