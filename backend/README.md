# Nakama Backend

This backend runs Nakama `3.22.0` with a TypeScript runtime module for a server-authoritative tic-tac-toe game.

## What is included

- Authoritative match handler in TypeScript
- Named room creation and room-code lookup RPCs
- Matchmaker-to-authoritative-match handoff
- Server-side per-turn timer with automatic forfeit
- Reconnect grace handling
- Leaderboard writes on game completion

## Project layout

- `src/main.ts`: Nakama runtime source
- `local.yml`: Nakama server config
- `docker-compose.yml`: Postgres + custom Nakama image
- `Dockerfile`: builds the TypeScript runtime and copies it into Nakama

## Start the backend

```sh
cd backend
npm ci
npm run dev
```

## Stop the backend

```sh
cd backend
npm run compose:down
```

## Reset all backend data

```sh
cd backend
docker compose down -v
```

## Development workflow

`npm run dev` now does two things together:

- runs `tsc` in watch mode and writes `build/index.js`
- runs `docker compose up --build --watch`

When you edit [src/main.ts](/Users/prateek/Documents/games/backend/src/main.ts), the local TypeScript watcher recompiles the runtime and Docker Compose `sync+restart`s the Nakama container so it reloads the new module. If you change `package.json`, `package-lock.json`, or `Dockerfile`, Compose performs a full image rebuild.

Useful scripts:

- `npm run build`
- `npm run build:watch`
- `npm run typecheck`
- `npm run compose:up`
- `npm run compose:up:detached`
- `npm run compose:logs`
- `npm run compose:down`

## Local endpoints

- API: `http://127.0.0.1:7350`
- Console: `http://127.0.0.1:7351`
- Socket: `ws://127.0.0.1:7350/ws`
- Postgres: `127.0.0.1:5432`

## Default console login

- Email: `admin@nakama.local`
- Password: `password123`

## Runtime contract

### RPCs

- `create_room`
  - Request: `{ "mode": "classic" | "timed" }`
  - Response: `{ "matchId": "...", "roomCode": "...", "mode": "classic" | "timed" }`
- `join_room`
  - Request: `{ "roomCode": "ABC123" }`
  - Response: `{ "matchId": "...", "roomCode": "ABC123", "mode": "classic" | "timed" }`
- `list_leaderboard`
  - Request: `{ "limit": 10 }`
  - Response: `{ "leaderboardId": "tic_tac_toe_wins", "records": [...] }`

### Match data op-codes

- `1`: client move request, payload `{ "index": 0..8 }`
- `2`: server state snapshot / update
- `3`: server system event / validation error

### Match state payload

Server broadcasts JSON shaped like:

```json
{
  "matchId": "....",
  "roomCode": "ABC123",
  "mode": "classic",
  "board": ["X", null, "O", null, null, null, null, null, null],
  "turn": "X",
  "players": {
    "X": { "userId": "user-a", "username": "alice", "connected": true },
    "O": { "userId": "user-b", "username": "bob", "connected": true }
  },
  "status": "active",
  "winner": null,
  "winningSymbol": null,
  "timer": 30,
  "timers": { "X": 30, "O": 30 },
  "disconnects": {}
}
```

## Frontend integration notes

- Use Nakama device auth or social auth from the React client.
- For queue matchmaking, call Nakama's socket matchmaker with a string property `mode`.
- When a match is found, join the returned authoritative match id.
- Send moves through socket match data with op-code `1`.
- Treat op-code `2` as the only source of truth for rendering board state.

## Sources

This setup follows Heroic Labs' official Docker and TypeScript runtime approach:

- https://heroiclabs.com/docs/nakama/getting-started/install/docker/
- https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/
- https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/
- https://docs.docker.com/compose/how-tos/file-watch/
