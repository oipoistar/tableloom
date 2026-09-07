import { ref, watch } from 'vue';
import * as Y from 'yjs';
import { project, notify, reportError, scheduleSave, flushSave, accessRole, projects } from './store';
import { writeShared, readShared, encodeUpdate, decodeUpdate } from './core/collaboration';
import { clone, uid, stableStringify } from './core/model';
import { persistProject } from './persistence';
import type { Role } from './core/collaboration';
export const connectionState = ref<'offline' | 'connecting' | 'connected' | 'conflict'>('offline');
export const connectionRole = ref<Role>('owner');
export const connectionInfo = ref<{ url: string; roomId: string; token: string }>();
let doc: Y.Doc | undefined;
let socket: WebSocket | undefined;
let stop: (() => void) | undefined;
let applying = false;
export function disconnect() {
  stop?.();
  stop = undefined;
  socket?.close();
  socket = undefined;
  doc?.destroy();
  doc = undefined;
  connectionState.value = 'offline';
  connectionInfo.value = undefined;
  connectionRole.value = 'owner';
  accessRole.value = 'owner';
}
export async function connect(url: string, roomId: string, token: string, adoptRemote = false) {
  disconnect();
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an HTTP or HTTPS server URL');
  if (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(parsed.hostname))
    throw new Error('Use HTTPS for servers on other computers');
  const response = await fetch(`${url.replace(/\/$/, '')}/rooms/${encodeURIComponent(roomId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const remote = await response.json();
  if (!response.ok) throw new Error(remote.error ?? 'Connection failed');
  if (stableStringify(project.value) !== stableStringify(remote.project) && !adoptRemote)
    throw new Error(
      'The shared version differs from this local copy. Choose “Open room project” to save your current project and load it.',
    );
  await flushSave();
  if (adoptRemote) {
    const backup = clone(project.value);
    backup.id = uid('project');
    backup.name += ' · before shared room';
    await persistProject(backup);
    projects.value.unshift(backup);
  }
  connectionState.value = 'connecting';
  connectionInfo.value = { url, roomId, token };
  connectionRole.value = remote.role;
  accessRole.value = remote.role;
  doc = new Y.Doc();
  socket = new WebSocket(url.replace(/^http/, 'ws'));
  const current = doc;
  socket.onopen = () => socket?.send(JSON.stringify({ type: 'join', roomId, token }));
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'error') {
        connectionState.value = 'conflict';
        notify(message.message);
        return;
      }
      if (message.type === 'role') {
        connectionRole.value = message.role;
        accessRole.value = message.role;
        return;
      }
      if (message.type === 'sync' || message.type === 'update') {
        applying = true;
        Y.applyUpdate(current, decodeUpdate(message.update), 'remote');
        project.value = readShared(current);
        scheduleSave();
        applying = false;
        if (message.type === 'sync') {
          connectionRole.value = message.role;
          accessRole.value = message.role;
          connectionState.value = 'connected';
          stop = watch(
            () => project.value.updatedAt,
            () => {
              if (applying || connectionRole.value === 'viewer') return;
              if (connectionRole.value === 'commenter') {
                const before = readShared(current).notes,
                  after = project.value.notes;
                const upsert = after.filter(
                  (n) => stableStringify(n) !== stableStringify(before.find((b) => b.id === n.id)),
                );
                const remove = before.filter((n) => !after.some((a) => a.id === n.id)).map((n) => n.id);
                if ((upsert.length || remove.length) && socket?.readyState === WebSocket.OPEN)
                  socket.send(JSON.stringify({ type: 'notes', upsert, remove }));
              } else writeShared(current, project.value, 'local');
            },
            { flush: 'sync' },
          );
          current.on('update', (update: Uint8Array, origin: unknown) => {
            if (origin === 'local' && socket?.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify({ type: 'update', update: encodeUpdate(update) }));
          });
          notify('Connected to shared project');
        }
      }
    } catch (e) {
      applying = false;
      reportError(e);
      connectionState.value = 'conflict';
    }
  };
  socket.onclose = () => {
    if (connectionInfo.value) {
      stop?.();
      stop = undefined;
      accessRole.value = 'owner';
      connectionState.value = 'offline';
      notify(
        'Connection closed. Your current project remains saved locally. Reconnect to review the shared version.',
      );
    }
  };
}
export async function createRoom(url: string, adminToken: string, name: string) {
  const response = await fetch(url.replace(/\/$/, '') + '/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ project: project.value, name }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data as { roomId: string; token: string; memberId: string };
}
export async function addMember(name: string, role: Role) {
  const info = connectionInfo.value;
  if (!info) throw new Error('Connect first');
  const response = await fetch(`${info.url}/rooms/${info.roomId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
    body: JSON.stringify({ name, role }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

watch(
  () => project.value.id,
  () => {
    if (!applying && connectionInfo.value) disconnect();
  },
  { flush: 'sync' },
);
export async function roomMembers() {
  const info = connectionInfo.value;
  if (!info) return [];
  const response = await fetch(`${info.url}/rooms/${info.roomId}`, {
    headers: { Authorization: `Bearer ${info.token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.members as { id: string; name: string; role: Role }[];
}
export async function transferOwnership(memberId: string) {
  const info = connectionInfo.value;
  if (!info) throw new Error('Connect first');
  const response = await fetch(`${info.url}/rooms/${info.roomId}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
    body: JSON.stringify({ memberId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  connectionRole.value = 'editor';
  accessRole.value = 'editor';
  notify('Ownership transferred');
}
