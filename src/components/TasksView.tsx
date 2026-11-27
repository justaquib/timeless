import { CheckCircle2, Circle, ListTodo, Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import type { Task } from "../domain/tasks";

function formatUpdatedAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function TasksView({
  tasks,
  title,
  notes,
  loading,
  onTitleChange,
  onNotesChange,
  onAddTask,
  onToggleTask,
  onRemoveTask,
}: {
  tasks: Task[];
  title: string;
  notes: string;
  loading: boolean;
  onTitleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onAddTask: (event: FormEvent<HTMLFormElement>) => void;
  onToggleTask: (task: Task) => void;
  onRemoveTask: (id: string) => void;
}) {
  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <ListTodo size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Your tasks</p>
            <p className="mt-1 text-xs text-slate-500">Capture what you want to get done. Tasks are saved on this device.</p>
          </div>
        </div>
        <form className="mt-5 space-y-3" onSubmit={onAddTask}>
          <input
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            onChange={(event) => onTitleChange(event.currentTarget.value)}
            placeholder="What needs doing?"
            value={title}
          />
          <textarea
            className="min-h-20 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            onChange={(event) => onNotesChange(event.currentTarget.value)}
            placeholder="Notes (optional)"
            value={notes}
          />
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            type="submit"
          >
            <Plus size={16} /> Add task
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">
            {loading ? "Loading tasks…" : `${open.length} open · ${done.length} done`}
          </p>
        </div>
        {tasks.length ? (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <div className="flex items-start gap-3 px-5 py-3.5" key={task.id}>
                <button
                  aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
                  className="mt-0.5 shrink-0 text-slate-400 hover:text-indigo-600"
                  onClick={() => onToggleTask(task)}
                  type="button"
                >
                  {task.completed ? <CheckCircle2 className="text-emerald-500" size={19} /> : <Circle size={19} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-xs font-semibold ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
                    {task.title}
                  </p>
                  {task.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{task.notes}</p>}
                  <p className="mt-1 text-[10px] text-slate-400">Updated {formatUpdatedAt(task.updatedAt)}</p>
                </div>
                <button
                  aria-label={`Remove ${task.title}`}
                  className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                  onClick={() => onRemoveTask(task.id)}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
              <ListTodo size={21} />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800">{loading ? "Loading…" : "No tasks yet"}</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Add a task above to start keeping track of your work.</p>
          </div>
        )}
      </section>
    </div>
  );
}