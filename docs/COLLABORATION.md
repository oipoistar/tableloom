# Optional self-hosted collaboration

Local authoring never needs a server. The optional service synchronizes project data through Yjs, with separate keys for entity properties. Concurrent edits to distinct rows and fields merge; concurrent changes to the same scalar converge according to Yjs conflict resolution. The current project is saved before joining. When opening a differing shared version, a separate local backup project is created first. Offline documents remain editable locally; reconnecting currently requires deliberately choosing the server copy rather than silently replacing it.

Run with Node.js 22.12 or later:

```powershell
$env:TABLELOOM_ADMIN_TOKEN = '<a long random administration token>'
npm run collaboration
```

The default host is 127.0.0.1 and port 4318. The server prints its address, never its tokens. Data is persisted in `.tableloom-server` using temporary files and atomic rename. To host for a team, put the service behind HTTPS and configure `TABLELOOM_HOST`, `TABLELOOM_PORT`, `TABLELOOM_DATA`, and the explicit comma-separated `TABLELOOM_ORIGINS` allowlist. Ownership can be transferred in Project settings → Shared workspace. Element comments are available in the inspector. The desktop file origin is `null`; the browser development origin is `http://127.0.0.1:5173`.

POST /rooms creates a room using the administration token. It returns a new owner token. The owner can create editor, commenter and viewer tokens through POST /rooms/:id/members. Tokens are stored hashed at rest. POST /rooms/:id/transfer transfers ownership to an existing member. The service validates the complete prospective project before accepting a CRDT update and enforces roles on the server.

Owners and editors edit the document. Commenters submit validated note operations; they cannot submit arbitrary CRDT updates. The server updates timestamps. Viewers can read. WebSocket authentication is the first message, keeping tokens out of URLs and routine request logs. There are origin checks, payload bounds, an authentication deadline, and rate limits. Production operators remain responsible for HTTPS, backups and access-token distribution. No invitations are sent automatically.
