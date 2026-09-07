import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { createStarter } from '../src/core/starters';
import { writeShared, readShared, decodeUpdate, encodeUpdate } from '../src/core/collaboration';
it('authenticates rooms, syncs concurrent clients, rejects viewer writes and transfers ownership', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tableloom-server-test-')),
    secret = randomBytes(24).toString('hex');
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, TABLELOOM_PORT: '0', TABLELOOM_ADMIN_TOKEN: secret, TABLELOOM_DATA: directory },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sockets: WebSocket[] = [];
  const docs: Y.Doc[] = [];
  try {
    const port = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]!);
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited ${code}`));
      });
    });
    const url = `http://127.0.0.1:${port}`;
    const request = async (endpoint: string, token: string, body?: unknown) => {
      const response = await fetch(url + endpoint, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: await response.json() };
    };
    expect((await request('/rooms', 'bad', { project: createStarter('orchard') })).status).toBe(401);
    const owner = (
      await request('/rooms', secret, { project: createStarter('orchard'), name: 'Owner fixture' })
    ).data;
    const editor = (
      await request(`/rooms/${owner.roomId}/members`, owner.token, { name: 'Editor fixture', role: 'editor' })
    ).data;
    const viewer = (
      await request(`/rooms/${owner.roomId}/members`, owner.token, { name: 'Viewer fixture', role: 'viewer' })
    ).data;
    const commenter = (
      await request(`/rooms/${owner.roomId}/members`, owner.token, {
        name: 'Comment fixture',
        role: 'commenter',
      })
    ).data;
    const next = (socket: WebSocket, type: string) =>
      new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.off('message', listener);
          reject(new Error(`Missing ${type} response`));
        }, 5000);
        const listener = (bytes: Buffer) => {
          const message = JSON.parse(bytes.toString());
          if (message.type === type) {
            clearTimeout(timeout);
            socket.off('message', listener);
            resolve(message);
          }
        };
        socket.on('message', listener);
      });
    const connect = async (token: string) => {
      const socket = new WebSocket(url.replace('http', 'ws'));
      sockets.push(socket);
      const sync = next(socket, 'sync');
      socket.on('open', () => socket.send(JSON.stringify({ type: 'join', roomId: owner.roomId, token })));
      const message = await sync;
      const doc = new Y.Doc();
      docs.push(doc);
      Y.applyUpdate(doc, decodeUpdate(message.update));
      return { socket, doc };
    };
    const a = await connect(owner.token),
      b = await connect(editor.token),
      v = await connect(viewer.token),
      c = await connect(commenter.token);
    const send = (client: typeof a, field: string, value: string) => {
      const updates: Uint8Array[] = [];
      const handler = (update: Uint8Array) => updates.push(update);
      client.doc.on('update', handler);
      const p = readShared(client.doc);
      p.sets[0]!.rows[0]![field] = value;
      writeShared(client.doc, p);
      client.doc.off('update', handler);
      client.socket.send(JSON.stringify({ type: 'update', update: encodeUpdate(Y.mergeUpdates(updates)) }));
    };
    const aSaved = next(a.socket, 'saved'),
      bSaved = next(b.socket, 'saved');
    send(a, 'name', 'Concurrent name');
    send(b, 'effect', 'Concurrent effect');
    await Promise.all([aSaved, bSaved]);
    const state = (await request(`/rooms/${owner.roomId}`, owner.token)).data.project;
    expect(state.sets[0].rows[0].name).toBe('Concurrent name');
    expect(state.sets[0].rows[0].effect).toBe('Concurrent effect');
    const rejected = next(v.socket, 'error');
    send(v, 'name', 'Forbidden');
    expect((await rejected).message).toMatch(/role/);
    expect((await request(`/rooms/${owner.roomId}`, owner.token)).data.project.sets[0].rows[0].name).toBe(
      'Concurrent name',
    );
    const commentRejected = next(c.socket, 'error');
    send(c, 'name', 'Commenter forbidden');
    expect((await commentRejected).message).toMatch(/role/);
    const noteSaved = next(c.socket, 'saved');
    c.socket.send(
      JSON.stringify({
        type: 'notes',
        upsert: [
          {
            id: 'fixture-note',
            target: 'first-card',
            session: 'Fixture',
            category: 'layout',
            text: 'Readable',
            resolved: false,
            createdAt: new Date().toISOString(),
          },
        ],
        remove: [],
      }),
    );
    await noteSaved;
    expect(
      (await request(`/rooms/${owner.roomId}`, owner.token)).data.project.notes.some(
        (n: { id: string }) => n.id === 'fixture-note',
      ),
    ).toBe(true);
    expect(
      (await request(`/rooms/${owner.roomId}/transfer`, owner.token, { memberId: editor.id })).status,
    ).toBe(200);
    expect((await request(`/rooms/${owner.roomId}`, editor.token)).data.role).toBe('owner');
    expect((await request(`/rooms/${owner.roomId}`, owner.token)).data.role).toBe('editor');
    const disk = await readFile(path.join(directory, owner.roomId + '.json'), 'utf8');
    expect(disk).not.toContain(owner.token);
    expect(disk).not.toContain(editor.token);
  } finally {
    for (const socket of sockets) socket.terminate();
    for (const doc of docs) doc.destroy();
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep))
      throw new Error('Unexpected test directory');
    await rm(resolved, { recursive: true, force: true });
  }
}, 20000);
