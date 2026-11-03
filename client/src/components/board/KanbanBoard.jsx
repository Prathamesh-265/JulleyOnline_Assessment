import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import InlineAdd from "../ui/InlineAdd";
import BoardColumn from "./BoardColumn";
import { CardFace } from "./TaskCard";

export default function KanbanBoard({
  board,
  actions,
  isAdmin,
  onOpen,
  onRenameColumn,
  onDeleteColumn,
}) {
  const [activeId, setActiveId] = useState(null);
  const scroller = useRef(null);

  // a small drag distance keeps plain clicks working; on touch, a short press starts the drag
  // so the board can still be scrolled sideways with a swipe
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  // columns glide in whenever a different board is opened
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from(".column", {
        y: 24,
        opacity: 0,
        duration: 0.5,
        stagger: 0.07,
        ease: "power3.out",
        clearProps: "all",
      });
    }, scroller);
    return () => ctx.revert();
  }, [board.id]);

  const activeTask =
    activeId &&
    board.columns.flatMap((c) => c.tasks).find((t) => t.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => {
        setActiveId(active.id);
        actions.dragStart(active.id);
      }}
      onDragOver={({ active, over }) =>
        over && actions.dragOver(active.id, over.id)
      }
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        actions.dragEnd(active.id, over?.id);
      }}
      onDragCancel={() => {
        setActiveId(null);
        actions.dragCancel();
      }}
    >
      <div className="board-scroll" ref={scroller} data-lenis-prevent>
        {board.columns.map((column, i) => (
          <BoardColumn
            key={column.id}
            column={column}
            isLast={i === board.columns.length - 1}
            isAdmin={isAdmin}
            onOpen={onOpen}
            onAddTask={actions.createTask}
            onRename={onRenameColumn}
            onDelete={onDeleteColumn}
          />
        ))}
        {isAdmin && (
          <InlineAdd
            label="Column"
            placeholder="Column name"
            onSubmit={actions.addColumn}
            className="column-add"
          />
        )}
      </div>
      <DragOverlay dropAnimation={{ duration: 180 }}>
        {activeTask ? (
          <div className="task overlay">
            <CardFace task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
