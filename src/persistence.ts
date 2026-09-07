import { openDB } from 'idb';
import type { Project } from './core/model';
import { parseProject } from './core/model';
const db = () =>
  openDB('tableloom', 1, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' });
    },
  });
export async function savedProjects(): Promise<Project[]> {
  const result: Project[] = [];
  if (window.tableloom) {
    for (const entry of await window.tableloom.listProjects()) {
      try {
        result.push(parseProject(JSON.parse(entry.data)));
      } catch (e) {
        console.error('Project recovery failed', entry.id, e);
      }
    }
  } else {
    for (const entry of await (await db()).getAll('projects')) {
      try {
        result.push(parseProject(entry));
      } catch (e) {
        console.error('Project recovery failed', e);
      }
    }
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function persistProject(project: Project): Promise<void> {
  const json = JSON.stringify(project);
  if (window.tableloom) await window.tableloom.autosave(project.id, json);
  else await (await db()).put('projects', JSON.parse(json));
}
export async function saveBytes(bytes: Uint8Array, name: string): Promise<string | null> {
  if (window.tableloom) return window.tableloom.saveFile([...bytes], name);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return name;
}
export async function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
