"use client";

import { startTransition, useOptimistic, useState, type DragEvent, type MouseEvent } from "react";
import type { TaskStatus } from "@/generated/prisma/enums";
import { moveTaskAction } from "@/app/actions/crm-tasks";
import { TASK_STATUS } from "@/lib/labels";
import { TaskCard, type TaskCardData } from "@/components/crm/task-card";

export type BoardColumn = { status: TaskStatus; hint?: string };
type Move = { id: string; status: TaskStatus; position: number };

/** Сервер подставит конец колонки (moveTask обрезает индекс по числу карточек). */
const APPEND = 100_000;

const byPosition = (a: TaskCardData, b: TaskCardData) => a.position - b.position || b.createdAt - a.createdAt;

/** Тот же порядок, что compareInColumn на сервере: по сроку, без срока — по position, «Выполнена» — свежие сверху. */
function inColumn(status: TaskStatus) {
  return (a: TaskCardData, b: TaskCardData) => {
    if (status === "DONE") return (b.completedAt ?? 0) - (a.completedAt ?? 0);
    if (a.due && b.due) return a.due.at - b.due.at;
    if (a.due) return -1;
    if (b.due) return 1;
    return byPosition(a, b);
  };
}

const EMPTY: Record<string, string> = {
  OPEN: "Новых задач нет — создайте в форме выше",
  IN_PROGRESS: "Перетащите сюда карточку или нажмите «В работу»",
  REVIEW: "Сюда — задачи, которые ждут проверки",
  DONE: "Выполненных за 7 дней пока нет",
};

/**
 * Доска: HTML5 drag-and-drop без библиотек, перенос применяется сразу (useOptimistic) и подтверждается
 * moveTaskAction. Для телефона и клавиатуры у каждой карточки есть кнопки «В работу» / «Готово» и меню «→ этап».
 */
export function TaskBoard({ tasks, columns, highlightId }: { tasks: TaskCardData[]; columns: BoardColumn[]; highlightId?: string }) {
  const [list, apply] = useOptimistic(tasks, (state: TaskCardData[], m: Move) =>
    state.map((t) => (t.id === m.id ? { ...t, status: m.status, position: m.position, completedAt: m.status === "DONE" ? t.completedAt ?? Date.now() : null } : t)),
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // позиция для сервера — индекс среди остальных карточек колонки по position (так её понимает moveTask);
  // бросок перед карточкой со сроком не меняет порядок (срочные и так наверху) — карточка идёт в конец
  const move = (id: string, status: TaskStatus, before: TaskCardData | null) => {
    const others = list.filter((t) => t.status === status && t.id !== id).sort(byPosition);
    const idx = before && !before.due ? others.findIndex((t) => t.id === before.id) : -1;
    const position = idx >= 0 ? idx : APPEND;
    const optimistic = idx >= 0 && before ? before.position - 0.5 : (others.at(-1)?.position ?? -1) + 1;
    startTransition(async () => {
      apply({ id, status, position: optimistic });
      const r = await moveTaskAction({ id, status, position });
      if (r?.error) setError(r.error);
    });
  };

  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  };
  const onDragEnd = () => {
    setDragId(null);
    setOver(null);
  };
  const dropOn = (e: DragEvent, status: TaskStatus, before: TaskCardData | null) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setOver(null);
    setDragId(null);
    if (!id || before?.id === id) return;
    move(id, status, before);
  };

  return (
    <div>
      {error && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Закрыть сообщение" className="text-lg leading-none">×</button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const items = list.filter((t) => t.status === col.status).sort(inColumn(col.status));
          const active = over === col.status && dragId !== null;
          return (
            <section
              key={col.status}
              aria-label={`${TASK_STATUS[col.status].label}: ${items.length}`}
              className={`flex min-h-40 flex-col rounded-xl border p-2 transition-colors ${active ? "border-ink bg-sand/70" : "border-transparent bg-sand/30"}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== col.status) setOver(col.status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => dropOn(e, col.status, null)}
            >
              <header className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <h2 className="text-sm font-semibold">
                  {TASK_STATUS[col.status].label} <span className="ml-1 text-xs font-normal text-muted">{items.length}</span>
                </h2>
                {col.hint && <span className="text-[0.68rem] text-muted">{col.hint}</span>}
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {items.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t.id)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (over !== col.status) setOver(col.status);
                    }}
                    onDrop={(e) => dropOn(e, col.status, t)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <TaskCard t={t} highlighted={t.id === highlightId} dragging={t.id === dragId} actions={<CardActions t={t} columns={columns} onMove={(status) => move(t.id, status, null)} />} />
                  </div>
                ))}
                {items.length === 0 && <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">{EMPTY[col.status] ?? "Пусто"}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CardActions({ t, columns, onMove }: { t: TaskCardData; columns: BoardColumn[]; onMove: (s: TaskStatus) => void }) {
  const closeMenu = (e: MouseEvent<HTMLElement>) => e.currentTarget.closest("details")?.removeAttribute("open");
  const open = t.status !== "DONE" && t.status !== "CANCELLED";
  return (
    <>
      {t.status === "OPEN" && <button type="button" onClick={() => onMove("IN_PROGRESS")} className="rounded px-1.5 py-0.5 hover:bg-sand hover:text-ink">В работу</button>}
      {open && <button type="button" onClick={() => onMove("DONE")} className="rounded px-1.5 py-0.5 text-success hover:bg-sand">Готово</button>}
      <details className="relative">
        <summary className="cursor-pointer list-none rounded px-1.5 py-0.5 hover:bg-sand hover:text-ink" aria-label={`Переместить задачу «${t.title}» на другой этап`}>→ этап</summary>
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-line bg-white p-1 shadow-lg">
          {columns.filter((c) => c.status !== t.status).map((c) => (
            <button key={c.status} type="button" onClick={(e) => { closeMenu(e); onMove(c.status); }} className="block w-full rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-sand">
              {TASK_STATUS[c.status].label}
            </button>
          ))}
          {t.status !== "CANCELLED" && (
            <button type="button" onClick={(e) => { closeMenu(e); onMove("CANCELLED"); }} className="block w-full rounded px-2 py-1.5 text-left text-xs text-muted hover:bg-sand hover:text-danger">
              Отменить
            </button>
          )}
        </div>
      </details>
    </>
  );
}
