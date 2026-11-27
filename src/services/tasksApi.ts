import { invoke } from "@tauri-apps/api/core";
import type { Task } from "../domain/tasks";

export const getTasks = () => invoke<Task[]>("get_tasks");
export const saveTask = (task: Task) => invoke("save_task", { task });
export const deleteTask = (id: string) => invoke("delete_task", { id });