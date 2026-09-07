import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { parseProject } from '../src/core/model';
import {
  writeShared,
  readShared,
  permittedChanges,
  encodeUpdate,
  decodeUpdate,
} from '../src/core/collaboration';
import type { Role } from '../src/core/collaboration';
interface Member {
  id: string;
  name: string;
  role: Role;
  hash: string;
}
interface Room {
  id: string;
  name: string;
  members: Member[];
  doc: Y.Doc;
  clients: Map<WebSocket, Member>;
  saving: Promise<void>;
}
const port = Number(process.env.TABLELOOM_PORT ?? 4318);
const host = process.env.TABLELOOM_HOST ?? '127.0.0.1';
const root = path.resolve(process.env.TABLELOOM_DATA ?? '.tableloom-server');
const admin = process.env.TABLELOOM_ADMIN_TOKEN;
const origins = (process.env.TABLELOOM_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173,null').split(
  ',',
);
const rooms = new Map<string, Room>();
function hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
function matches(token: string, expected: string) {
  const a = Buffer.from(hash(token), 'hex'),
    b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
function auth(room: Room, token: string) {
  return room.members.find((m) => matches(token, m.hash));
}
function save(room: Room) {
  room.saving = room.saving
    .catch(() => {})
    .then(async () => {
      const target = path.join(root, `${room.id}.json`);
      const temp = target + '.tmp';
      await mkdir(root, { recursive: true });
      await writeFile(
        temp,
        JSON.stringify({
          id: room.id,
          name: room.name,
          members: room.members,
          update: encodeUpdate(Y.encodeStateAsUpdate(room.doc)),
        }),
      );
      await rename(temp, target);
    });
  return room.saving;
}
function json(response: import('node:http').ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}
async function body(request: import('node:http').IncomingMessage) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 40_000_000) throw new Error('Request too large');
  }
  return JSON.parse(text || '{}');
}
async function loadRooms() {
  await mkdir(root, { recursive: true });
  const { readdir } = await import('node:fs/promises');
  for (const file of (await readdir(root)).filter((f) => f.endsWith('.json'))) {
    try {
      const state = JSON.parse(await readFile(path.join(root, file), 'utf8'));
      const doc = new Y.Doc();
      Y.applyUpdate(doc, decodeUpdate(state.update));
      readShared(doc);
      rooms.set(state.id, { ...state, doc, clients: new Map(), saving: Promise.resolve() });
    } catch (e) {
      console.error('Could not load room', file, (e as Error).message);
    }
  }
}
const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !origins.includes(origin)) {
    json(response, 403, { error: 'Origin not permitted' });
    return;
  }
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  try {
    const parts = (request.url ?? '/').split('/').filter(Boolean);
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (request.method === 'GET' && parts[0] === 'health') {
      json(response, 200, { service: 'Tableloom collaboration', version: 1 });
      return;
    }
    if (request.method === 'POST' && parts.length === 1 && parts[0] === 'rooms') {
      if (!admin || !matches(token, hash(admin))) {
        json(response, 401, { error: 'A server administration token is required to create a room' });
        return;
      }
      const data = await body(request);
      const project = parseProject(data.project);
      const ownerToken = randomBytes(32).toString('hex');
      const id = randomBytes(12).toString('hex');
      const owner: Member = {
        id: randomBytes(8).toString('hex'),
        name: String(data.name ?? 'Owner').slice(0, 100),
        role: 'owner',
        hash: hash(ownerToken),
      };
      const doc = new Y.Doc();
      writeShared(doc, project);
      const room: Room = {
        id,
        name: project.name,
        members: [owner],
        doc,
        clients: new Map(),
        saving: Promise.resolve(),
      };
      rooms.set(id, room);
      await save(room);
      json(response, 201, { roomId: id, token: ownerToken, memberId: owner.id });
      return;
    }
    const room = rooms.get(parts[1] ?? '');
    const member = room && auth(room, token);
    if (!room || !member) {
      json(response, 401, { error: 'Invalid room or access token' });
      return;
    }
    if (request.method === 'GET' && parts.length === 2) {
      json(response, 200, {
        roomId: room.id,
        name: room.name,
        role: member.role,
        members: room.members.map(({ hash, ...m }) => m),
        project: readShared(room.doc),
      });
      return;
    }
    if (request.method === 'POST' && parts[2] === 'members' && member.role === 'owner') {
      const data = await body(request);
      if (!['editor', 'commenter', 'viewer'].includes(data.role))
        throw new Error('Choose editor, commenter, or viewer');
      const token = randomBytes(32).toString('hex');
      const invited: Member = {
        id: randomBytes(8).toString('hex'),
        name: String(data.name ?? 'Teammate').slice(0, 100),
        role: data.role,
        hash: hash(token),
      };
      room.members.push(invited);
      await save(room);
      json(response, 201, { id: invited.id, name: invited.name, role: invited.role, token });
      return;
    }
    if (request.method === 'POST' && parts[2] === 'transfer' && member.role === 'owner') {
      const data = await body(request);
      const target = room.members.find((m) => m.id === data.memberId);
      if (!target || target.id === member.id) throw new Error('Select another member');
      member.role = 'editor';
      target.role = 'owner';
      await save(room);
      for (const [client, m] of room.clients) client.send(JSON.stringify({ type: 'role', role: m.role }));
      json(response, 200, { ok: true });
      return;
    }
    json(response, 403, { error: 'This role cannot perform that action' });
  } catch (e) {
    json(response, 400, { error: (e as Error).message });
  }
});
const sockets = new WebSocketServer({ server, maxPayload: 40_000_000 });
sockets.on('connection', (socket, request) => {
  if (request.headers.origin && !origins.includes(request.headers.origin)) {
    socket.close(1008, 'Origin not permitted');
    return;
  }
  let room: Room | undefined;
  let member: Member | undefined;
  let updates = 0;
  let windowStart = Date.now();
  const timer = setTimeout(() => socket.close(1008, 'Authenticate first'), 5000);
  socket.on('message', async (bytes) => {
    try {
      if (Date.now() - windowStart > 1000) {
        windowStart = Date.now();
        updates = 0;
      }
      if (++updates > 100) {
        socket.close(1008, 'Rate limit exceeded');
        return;
      }
      const message = JSON.parse(bytes.toString());
      if (!room) {
        if (message.type !== 'join') throw new Error('Authenticate first');
        room = rooms.get(String(message.roomId));
        member = room && auth(room, String(message.token));
        if (!room || !member) throw new Error('Invalid access token');
        clearTimeout(timer);
        room.clients.set(socket, member);
        socket.send(
          JSON.stringify({
            type: 'sync',
            role: member.role,
            update: encodeUpdate(Y.encodeStateAsUpdate(room.doc)),
          }),
        );
        return;
      }
      if (!member) throw new Error('Authenticate first');
      if (member.role === 'viewer') throw new Error('This role cannot edit the project');
      if (message.type === 'notes' && member.role === 'commenter') {
        if (
          !Array.isArray(message.upsert) ||
          message.upsert.length > 1000 ||
          !Array.isArray(message.remove) ||
          message.remove.some((id: unknown) => typeof id !== 'string')
        )
          throw new Error('Invalid note changes');
        const p = readShared(room.doc);
        const ids = new Set(message.upsert.map((note: { id: string }) => note.id));
        p.notes = [
          ...p.notes.filter((n) => !ids.has(n.id) && !message.remove.includes(n.id)),
          ...message.upsert,
        ];
        p.updatedAt = new Date().toISOString();
        parseProject(p);
        if (new Set(p.notes.map((n) => n.id)).size !== p.notes.length) throw new Error('Duplicate note IDs');
        const before = Y.encodeStateVector(room.doc);
        writeShared(room.doc, p, 'comments');
        const update = encodeUpdate(Y.encodeStateAsUpdate(room.doc, before));
        await save(room);
        for (const client of room.clients.keys())
          if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'update', update }));
        socket.send(JSON.stringify({ type: 'saved' }));
        return;
      }
      if (member.role === 'commenter') throw new Error('This role can submit note changes only');
      if (message.type !== 'update') throw new Error('Unknown message');
      const update = decodeUpdate(message.update);
      const candidate = new Y.Doc();
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(room.doc));
      Y.applyUpdate(candidate, update);
      try {
        if (
          !permittedChanges(
            member.role,
            new Map(room.doc.getMap<string>('project')),
            new Map(candidate.getMap<string>('project')),
          )
        )
          throw new Error('This role cannot edit those fields');
        readShared(candidate);
      } finally {
        candidate.destroy();
      }
      Y.applyUpdate(room.doc, update);
      await save(room);
      for (const client of room.clients.keys())
        if (client !== socket && client.readyState === WebSocket.OPEN)
          client.send(JSON.stringify({ type: 'update', update: message.update }));
      socket.send(JSON.stringify({ type: 'saved' }));
    } catch (e) {
      socket.send(JSON.stringify({ type: 'error', message: (e as Error).message }));
      if (!member) socket.close(1008, 'Authentication failed');
    }
  });
  socket.on('close', () => {
    clearTimeout(timer);
    room?.clients.delete(socket);
  });
});
await loadRooms();
server.listen(port, host, () =>
  console.log(
    `Tableloom collaboration listening on http://${host}:${(server.address() as import('node:net').AddressInfo).port}. ${admin ? 'Room creation enabled.' : 'Set TABLELOOM_ADMIN_TOKEN to enable room creation.'}`,
  ),
);
process.on('SIGINT', () => {
  for (const room of rooms.values()) for (const client of room.clients.keys()) client.close();
  server.close();
});
