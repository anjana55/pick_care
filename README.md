# Pick Care

An Uber-style platform that connects people who need care with caregivers, run by
an office team. Families search for and book caregivers; caregivers register, get
verified and work shifts; staff run requests, bookings, care plans, invoicing and
payouts, with optional AI agents doing parts of the work under a manual fallback.

The product is **white-labelled**: the name, logo, colours and languages come from
**Settings > Branding**, so one codebase serves several brands. Out of the box
it is branded Pick Care (the project was earlier called CareLink).

Everything is available in **English, Sinhala and Tamil**.

## What's in the repo

| Path | What it is | Runs on |
|---|---|---|
| `apps/api` | NestJS REST API, Drizzle ORM, MySQL 8. Swagger at `/docs`. | `:3001` (`/api` in production) |
| `apps/public-web` | Next.js public site: search, sign-up, the client account, the caregiver portal, overseas employers. | `:3002` (`/` in production) |
| `apps/web` | Next.js staff app (office staff and admins). | `:3000/staff` (`/staff` in production) |
| `apps/mobile` | Expo / React Native app for caregivers and clients (iOS and Android). | Expo |
| `packages/shared` | Types, value lists, validation helpers and the i18n engine used by every app. | — |
| `deploy/`, `setup.sh`, `update.sh`, `uninstall.sh` | nginx config and the server install / update / removal scripts. | Server |
| `i18n-review/` | Offline Sinhala/Tamil review spreadsheet and the script that applies it. | — |
| `docs/` | Architecture, development and feature reference. | — |

```
browser ─┬─ /         → public-web ─┐
         ├─ /staff    → web ────────┼─→ /api → api ─→ MySQL
phone ───┴─ mobile app ─────────────┘          └──→ document storage (local disk)
```

## Quick start (local development)

Requirements: **Node 24** (`nvm use` reads `.nvmrc`), npm, and Docker for MySQL
(or a local MySQL 8).

```bash
npm install                                  # one install for every workspace
docker compose up -d                         # MySQL on :3306 (+ Adminer on :8080)

cp apps/api/.env.example apps/api/.env       # defaults match docker-compose.yml
cp apps/web/.env.local.example apps/web/.env.local
cp apps/public-web/.env.example apps/public-web/.env.local

npm run db:migrate -w @care-platform/api     # apply the committed migrations
npm run db:seed -w @care-platform/api        # reference data + demo accounts (passwords printed once)

npm run dev:api          # http://localhost:3001  (Swagger: /docs)
npm run dev:public-web   # http://localhost:3002
npm run dev:web          # http://localhost:3000/staff
npm run dev:mobile       # Expo; see apps/mobile/README.md
```

More detail, including the environment variables, demo accounts and e2e tests, is
in [docs/development.md](docs/development.md).

## Everyday commands (repo root)

| Command | Does |
|---|---|
| `npm run typecheck` | Builds `packages/shared`, then type-checks every workspace. |
| `npm test` | Unit and component tests for the API, the public site and the mobile app. |
| `npm run build` | Production builds of the API and both web apps. |
| `npm run db:generate -w @care-platform/api` | Writes a new migration after a schema change. |

CI (`.github/workflows/ci.yml`) runs `typecheck` and `test` on every pull request.

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the system fits together: apps, API modules, data, auth, i18n, branding, background jobs.
- [docs/development.md](docs/development.md) — setting up, environment variables, tests, migrations, translations and coding conventions.
- [docs/features.md](docs/features.md) — reference for sign-in, registration, search, AI and security rules.
- [DEPLOYMENT.md](DEPLOYMENT.md) — putting it on a server: `setup.sh`, HTTPS, backups, updates, troubleshooting.
- [apps/mobile/README.md](apps/mobile/README.md) and [apps/mobile/BUILDING.md](apps/mobile/BUILDING.md) — the mobile app and store builds.
- [i18n-review/README.md](i18n-review/README.md) — reviewing Sinhala and Tamil wording.
- [docs/history/implementation-report.md](docs/history/implementation-report.md) — the original build report and early changelog (historical).
