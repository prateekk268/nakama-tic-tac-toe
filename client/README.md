# Tic-Tac-Toe Client

React frontend for the Nakama-backed tic-tac-toe game.

## Local Development

Use Node `22.x` or Node `20.19+` with Vite 8.

Install dependencies:

```sh
npm install
```

Run the dev server on all interfaces:

```sh
npm run dev:host
```

## Ngrok Setup

Frontend tunnel:

```sh
ngrok http --url=my-game-frontend.ngrok.io http://localhost:5173
```

Backend tunnel:

```sh
ngrok http --url=my-game-backend.ngrok.io http://localhost:7350
```

The client reads Nakama connection settings from `.env.local`. Current backend values:

```env
VITE_NAKAMA_HOST=my-game-backend.ngrok-free.io
VITE_NAKAMA_PORT=443
VITE_NAKAMA_SSL=true
VITE_NAKAMA_SERVER_KEY=defaultkey
```

After changing `.env.local`, restart the Vite dev server.
