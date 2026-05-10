# Pawn Electron

Pawn management app with a **single backend**: Express + Postgres + Drizzle runs in Docker, and both the React web build and the Electron desktop shell talk to it over HTTP.

## Architecture

- Frontend: React + Vite (`src/`) — runs in the browser and inside Electron.
- Desktop shell: Electron (`electron/`) — `main.ts` only launches a BrowserWindow; `preload.ts` is a no-op.
- Renderer → backend bridge: `src/browser-bridge.ts` installs `window.electron.ipcRenderer.invoke` that fetches the HTTP API in both environments.
- Backend: Express + Drizzle + Postgres (`server/src/`). Runs via Docker (`docker-compose.yml`) on `http://localhost:8787`.
- Mobile app: React Native + Expo (`mobile-react-native/`) — also talks to the same HTTP API.

## Routes

- `GET /health`
- `POST /auth/login`
- `GET|POST /users`, `PUT|DELETE /users/:id`
- `GET|POST /pawns`
- `POST /pawns/:id/pay-interest`, `/pawns/:id/adjust`, `/pawns/:id/redeem`
- `GET /pawns/:id/transactions`
- `GET /customers`, `GET /customers/:id/pawns`
- `GET /reports/{daily-transactions,inventory,financial-summary,overdue-items,top-customers}`
- `GET /storage/info`

## API setup

1. Copy env template:

```bash
cp .env.api.example .env
```

1. Update `.env`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/pawn
API_PORT=8787
```

1. Start API in dev mode:

```bash
npm run api:dev
```

## Docker (API + Postgres)

Start both services:

```bash
npm run docker:up
```

Check API:

```bash
curl http://localhost:8787/health
```

Stop services:

```bash
npm run docker:down
```

## Useful scripts

- `npm run dev` - Vite frontend dev server
- `npm run electron:dev` - Electron + frontend dev flow
- `npm run api:dev` - run backend API with tsx
- `npm run api:build` - compile backend to `dist-server/`
- `npm run api:start` - run compiled backend
- `npm run docker:up` - start Postgres + API containers
- `npm run docker:down` - stop and remove containers
- `npm run docker:logs` - stream API container logs
- `npm run build` - frontend production build

## Mobile app (React Native via Expo)

The mobile app lives in `mobile-react-native/` and is scaffolded with Expo + TypeScript.

1. Install dependencies (already done during scaffold):

```bash
cd mobile-react-native
npm install
```

2. Start Expo:

```bash
npm start
```

3. Run on device/simulator:

```bash
npm run android
# or
npm run ios
```

4. Connect mobile app to local API:

- If testing on a physical phone, do **not** use `localhost`.
- Use your computer LAN IP (example: `http://192.168.1.10:8787`) as API base URL in the mobile app.

Optional: create `mobile-react-native/.env` so Expo loads it when you run `npm start`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.10:8787
```

The Expo app mirrors the desktop **menu** (Dashboard, Pawn, Redeem, Interest, Customers, Reports, Users, Settings). It talks to the same HTTP API as the desktop shell and web build.

## Dev workflow (desktop)

1. Start Postgres + API: `npm run docker:up`
2. Run Vite + Electron + TS watchers: `npm run electron:dev` (this also triggers `docker:up`)

If the Docker API is already running, you can just run `npm run dev` for the browser build or `npm run electron:start` for the shell.
