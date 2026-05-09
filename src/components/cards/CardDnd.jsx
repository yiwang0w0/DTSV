'use client'

/**
 * CardDnd — 拖拽相关原语
 *
 * 基于 @dnd-kit/core 和 @dnd-kit/sortable，为卡片系统提供：
 *   - <CardDndProvider> — 顶层 DndContext + 传感器配置
 *   - <DraggableCard>   — 单纯可拖拽的项（不可排序）
 *   - <DroppableArea>   — 放置区，提供 isOver 视觉反馈
 *   - <SortableCard>    — 可排序的卡片（用于在同一容器内排序）
 *
 * 使用示例：
 *   <CardDndProvider onDragEnd={handleEnd}>
 *     <DroppableArea id="pool" highlight={accent}>
 *       {items.map(it => (
 *         <DraggableCard key={it.id} id={it.id} payload={{ kind: 'item', id: it.id }}>
 *           <ItemCard item={it} ... />
 *         </DraggableCard>
 *       ))}
 *     </DroppableArea>
 *   </CardDndProvider>
 */

import { useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── 顶层 Provider ────────────────────────────────────────────
export function CardDndProvider({ children, onDragStart, onDragEnd, onDragCancel, dragOverlay }) {
  const sensors = useSensors(
    // 点击拖拽：超过 6px 才开始拖动，避免误触
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      {dragOverlay !== undefined && (
        <DragOverlay dropAnimation={null}>
          {dragOverlay}
        </DragOverlay>
      )}
    </DndContext>
  )
}

// ── 单纯可拖拽 ───────────────────────────────────────────────
export function DraggableCard({ id, payload, children, disabled = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: payload,
    disabled,
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        cursor: disabled ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1,
        outline: 'none',
        touchAction: 'none',
      }}
    >
      {children}
    </div>
  )
}

// ── 放置区 ───────────────────────────────────────────────────
export function DroppableArea({
  id,
  payload,
  children,
  className,
  highlight = '#58a6ff',
  emptyHint,
  style: extraStyle,
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data: payload })
  const showHint = isOver && active
  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{
        position: 'relative',
        borderRadius: 12,
        border: `1px ${showHint ? 'solid' : 'dashed'} ${showHint ? highlight : '#30363d'}`,
        background: showHint ? `${highlight}10` : 'transparent',
        transition: 'background .15s, border-color .15s',
        minHeight: 80,
        ...extraStyle,
      }}
    >
      {children}
      {emptyHint && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: showHint ? highlight : '#484f58', fontSize: 12,
            pointerEvents: 'none', opacity: showHint ? 1 : 0.6,
          }}
        >
          {showHint ? '松开放入' : emptyHint}
        </div>
      )}
    </div>
  )
}

// ── 可排序的卡片 ─────────────────────────────────────────────
export function SortableCard({ id, payload, children, disabled = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: payload,
    disabled,
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: disabled ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.4 : 1,
        outline: 'none',
        touchAction: 'none',
      }}
    >
      {children}
    </div>
  )
}

// ── 排序容器（包装 SortableContext） ────────────────────────
export function SortableContainer({ items, children, strategy = rectSortingStrategy }) {
  const ids = useMemo(() => items.map(it => it.id ?? it), [items])
  return (
    <SortableContext items={ids} strategy={strategy}>
      {children}
    </SortableContext>
  )
}
