# Render Deploy

This repo includes a Render Blueprint in [render.yaml](/Users/prateek/Documents/games/render.yaml).

## Services

- `games-backend`: Docker web service running Nakama
- `games-client`: static site for the React frontend
- `games-postgres`: free Render Postgres database

## Important limits

- Free Render web services spin down after 15 minutes idle.
- Free Render Postgres expires 30 days after creation.
- This setup is good for demos and testing, not production.

## Deploy steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and select the repo.
3. When prompted for secrets:
   - Set `NAKAMA_SERVER_KEY` for `games-backend`
   - Set `VITE_NAKAMA_SERVER_KEY` for `games-client` to the exact same value
   - Set `VITE_NAKAMA_HOST` to your backend public hostname, for example `games-backend.onrender.com`
4. Finish the deploy and wait for all services to become healthy.
5. Open the `games-client` URL.

## Notes

- The backend start flow is handled by [backend/scripts/render-start.sh](/Users/prateek/Documents/games/backend/scripts/render-start.sh).
- It runs Nakama migrations and then starts Nakama on Render's assigned `PORT`.
- The backend uses Render Postgres through the generated `DATABASE_URL`.
