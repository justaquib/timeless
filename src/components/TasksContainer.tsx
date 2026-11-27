import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "react-toastify";
import { isTauri } from "@tauri-apps/api/core";
import type { Task } from "../domain/tasks";
import { deleteTask, getTasks, saveTask } from "../services/tasksApi";
import { TasksView } from "./TasksView";

export function TasksContainer() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    void getTasks()
      .then(setTasks)
      .catch((caught: unknown) => toast.error(`Could not load tasks: ${String(caught)}`))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (task: Task) => {
    if (!isTauri()) {
      toast.info("Tasks require the Timeless desktop app.");
      return;
    }
    try {
      await saveTask(task);
      setTasks((current) => {
        const next = current.filter((item) => item.id !== task.id);
        next.push(task);
        return next.sort((a, b) => Number(a.completed) - Number(b.completed) || b.updatedAt - a.updatedAt);
      });
      return true;
    } catch (caught) {
      toast.error(`Could not save task: ${String(caught)}`);
      return false;
    }
  };

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Give the task a title.");
      return;
    }
    const now = Date.now();
    const saved = await persist({
      id: crypto.randomUUID(),
      title: trimmed,
      notes: notes.trim(),
      completed: false,
      createdAt: now,
      updatedAt: now,
    });
    if (saved) {
      setTitle("");
      setNotes("");
      toast.success("Task added.");
    }
  };

  const toggleTask = (task: Task) => {
    void persist({ ...task, completed: !task.completed, updatedAt: Date.now() });
  };

  const removeTask = async (id: string) => {
    if (!isTauri()) return;
    try {
      await deleteTask(id);
      setTasks((current) => current.filter((item) => item.id !== id));
      toast.info("Task removed.");
    } catch (caught) {
      toast.error(`Could not remove task: ${String(caught)}`);
    }
  };

  return (
    <TasksView
      loading={loading}
      notes={notes}
      onNotesChange={setNotes}
      onAddTask={(event) => void addTask(event)}
      onTitleChange={setTitle}
      onToggleTask={toggleTask}
      onRemoveTask={(id) => void removeTask(id)}
      tasks={tasks}
      title={title}
    />
  );
}