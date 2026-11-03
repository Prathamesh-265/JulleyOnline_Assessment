import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import InlineAdd from "../ui/InlineAdd";
import TaskCard from "./TaskCard";

export default function BoardColumn({
  column,
  isLast,
  isAdmin,
  onOpen,
  onAddTask,
  onRename,
  onDelete,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section className={`column ${isOver ? "over" : ""}`}>
      <header>
        <h3>{column.name}</h3>
        <div className="col-tools">
          {isAdmin && (
            <>
              <button
                className="icon-btn"
                aria-label={`Rename ${column.name}`}
                title="Rename column"
                onClick={() => onRename(column)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <button
                className="icon-btn"
                aria-label={`Delete ${column.name}`}
                title="Delete column"
                onClick={() => onDelete(column)}
              >
                ✕
              </button>
            </>
          )}
          <span className="count">{column.tasks.length}</span>
        </div>
      </header>
      <div className="column-body" ref={setNodeRef}>
        <SortableContext
          items={column.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} done={isLast} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>
      <InlineAdd
        label="Add task"
        placeholder="Task title"
        onSubmit={(title) => onAddTask(column.id, title)}
      />
    </section>
  );
}
