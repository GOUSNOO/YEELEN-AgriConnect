# AGENTS.md

## Purpose
This file helps AI coding agents understand the `agri-app` repository, its architecture, how to run it, and where to make changes safely.

## Repository overview
- Full-stack agricultural management app.
- Frontend: React 19 + Vite 8 + PWA support.
- Backend: Express.js + PostgreSQL + JWT authentication.
- Backend code lives under `server/`; frontend lives under `src/`.

## Key commands
- Frontend: `npm install` then `npm run dev` from the repo root.
- Build frontend: `npm run build` from the repo root.
- Backend: `cd server && npm install && npm run dev`.

## Important files
- `src/main.jsx` - frontend entry point.
- `src/App.jsx` - main frontend application, large single-file UI with state and async data loading.
- `vite.config.js` - Vite config and PWA plugin settings.
- `server/src/server.js` - Express application bootstrap and API route mounting.
- `server/src/db.js` - PostgreSQL connection pool and database utilities.
- `server/src/config/env.js` - environment variable handling for backend.
- `server/src/routes/*.js` - backend API route definitions.
- `server/.env.example` - backend environment variable example.
- `.env` (repo root) - expected location for backend environment variables used by `server/src/config/env.js`.

## Architecture notes
- Frontend and backend are deployed separately. The backend uses its own `server/package.json` and runs with `nodemon` in dev mode.
- The backend exposes authenticated APIs under `/api/*`.
- JWT auth and role-based authorization are implemented in `server/src/middleware/auth.js` and `server/src/middleware/requireRole.js`.
- Many frontend components and views are currently contained in `src/App.jsx`, so changes there should be careful and incremental.

## Conventions
- Uses ESM `import`/`export` syntax throughout.
- React code uses functional components with hooks (`useState`, `useEffect`, `useMemo`, `useCallback`).
- Prefer modifying existing route handlers in `server/src/routes/` rather than adding new unrelated backend entrypoints.
- Keep UI logic in `src/App.jsx` consistent with the existing inline style and app-specific component patterns.

## When editing
- Preserve environment configuration in `server/src/config/env.js` and the root `.env` usage.
- Use `server/.env.example` as the source of truth for required backend env vars.
- Prefer small, explicit changes to `src/App.jsx` rather than broad rewrites, since it is currently the primary frontend app file.
- If adding a new feature, document expected route and frontend integration clearly.

## Reference
- See `README.md` for project overview, available modules, and role descriptions.
