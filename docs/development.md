# Development

## Requirements

- **Node 24** and npm. Run `nvm use` in the repo root (it reads `.nvmrc`). Expo
  SDK 58 supports Node 22.13+, 24.3+ and 26+, not odd releases such as 25.
- **MySQL 8**: `docker compose up -d` starts it on `:3306` with the credentials
  `apps/api/.env.example` already uses, plus Adminer on `:8080`.
- Windows, macOS or Linux.

## First-time setup

```bash
npm install                                    # one install for all workspaces
docker compose up -d

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
cp apps/public-web/.env.example apps/public-web/.env.local

npm run db:migrate -w @care-platform/api
npm run db:seed -w @care-platform/api
```

Then, in separate terminals, from the repo root:

| Command | URL |
|---|---|
| `npm run dev:api` | http://localhost:3001 (Swagger: `/docs`) |
| `npm run dev:public-web` | http://localhost:3002 |
| `npm run dev:web` | http://localhost:3000/staff |
| `npm run dev:mobile` | Expo QR code; see `apps/mobile/README.md` |

Each `dev:*` script builds `packages/shared` first. After changing anything in
`packages/shared` while an app is running, run `npm run build:shared` again.

### Demo accounts

`db:seed` loads skills, languages, locations and sample caregivers, and creates one
account per office role plus a caregiver. It prints each generated password once;
set `SEED_PASSWORD` beforehand to choose it (the e2e tests need this).

| Role | Email |
|---|---|
| ADMIN | `admin@care-platform.local` |
| STAFF | `staff@care-platform.local` |
| VERIFIER | `verifier@care-platform.local` |
| CAREGIVER | `selfregistered@care-platform.local` (signs in on the public site) |

`db:seed:production` is the production equivalent: reference data and one admin
from `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`, nothing else.

## Environment variables

The API reads `apps/api/.env`, then a repo-root `.env`; real environment
variables always win. `apps/api/.env.example` lists them all with comments. The
ones that matter first:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string (required). |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing keys (required; long random values in production). |
| `CORS_ORIGIN` | Comma-separated origins of the web apps. |
| `PUBLIC_WEB_URL`, `CAREGIVER_WEB_URL` | Where links in emails and redirects point. |
| `SETTINGS_ENCRYPTION_KEY` | Encrypts secrets saved in Settings (WhatsApp, social sign-in, AI keys). `openssl rand -base64 32`. |
| `STORAGE_LOCAL_ROOT` | Where uploaded documents are kept. |
| `SMTP_*`, `WHATSAPP_*`, `GEOCODER_*` | Only seed the matching Settings pages the first time; after that, configure them in the staff app. |

Without SMTP settings, emails are not sent and their content (verification links,
codes) is written to the API log instead.

Both web apps need only `NEXT_PUBLIC_API_URL`. The mobile app uses
`EXPO_PUBLIC_API_URL` to point at a local API.

Production settings are in `.env.production.example` and
[DEPLOYMENT.md](../DEPLOYMENT.md).

## Checks and tests

From the repo root:

```bash
npm run typecheck     # every workspace
npm test              # API unit tests, public-site and mobile component tests
```

Per app:

| App | Commands |
|---|---|
| `apps/api` | `npm test` (unit), `npm run test:e2e -- --forceExit` (against a migrated, seeded MySQL) |
| `apps/public-web` | `npm test` |
| `apps/mobile` | `npm test`, `npm run bundle:check` |
| `apps/web` | `npm run typecheck` (no component tests yet) |

The e2e suites sign in as the demo accounts, so seed and test with the same
password:

```bash
cd apps/api
SEED_PASSWORD=<password> npm run db:seed
SEED_PASSWORD=<password> npm run test:e2e -- --forceExit
```

`--forceExit` is needed because the MySQL pool keeps Node alive after the suite.
The e2e suites use stand-ins for WhatsApp, the AI model and other outside
services, so no real accounts are needed.

The API type-check needs about 1 GB of heap. If it runs out of memory, set
`NODE_OPTIONS=--max-old-space-size=4096`.

## Database changes

1. Edit the schema in `apps/api/src/database/schema/`.
2. `npm run db:generate -w @care-platform/api` writes the next numbered SQL file
   and snapshot in `apps/api/src/database/migrations/`. Give it a descriptive
   name and read the SQL before committing.
3. `npm run db:migrate -w @care-platform/api` applies it locally.

Never edit or reformat a migration that has been merged: servers have already
applied it. Fix forward with a new migration.

Location reference data is edited as CSV in `apps/api/src/database/seed-data/`
(`db:load-locations` loads it, `db:export-locations` writes the database back
out).

## Translations

Every user-facing string goes through the app's `t()` with keys in that app's
`en.json`, `si.json` and `ta.json`:

- Add a key to all three files in the same change. The three files must have
  exactly the same keys.
- Write `{brand}` instead of the product name, and keep every `{placeholder}`
  token unchanged in translations.
- New API messages go into `apps/api/src/common/i18n/messages.ts` with Sinhala
  and Tamil; the coverage test fails otherwise.
- Native-speaker review happens offline in `i18n-review/` (see its README).
- Remove keys you stop using, in all three languages.

## Conventions

- **TypeScript everywhere.** The web apps, mobile app and shared package use
  `strict`; the API uses `strictNullChecks` (the Nest default set). All of them
  set `noUnusedLocals`, so an unused import or variable fails the check. Run
  `npm run typecheck` before pushing; CI runs it with the tests.
- **Shared contracts live in `packages/shared`.** A request or response type used
  by more than one app belongs there, not copied into each app.
- **API:** one Nest module per area; DTOs validated with class-validator; services
  throw plain English messages (translated centrally); access control with
  `@Roles()` / `@CaregiverScope()`; audit-log sensitive reads and every change of
  consequence. Tests sit next to the code as `*.spec.ts`.
- **Web apps:** App Router pages in `src/app`, components in `src/components`,
  data hooks (TanStack Query) and API types in `src/lib`; forms use React Hook
  Form + Zod; the `@/` alias points at `src/`.
- **Mobile:** add native packages with `npx expo install`, use the app's own
  `Text` component, and see `apps/mobile/README.md` for its rules.
- **Formatting:** 2-space indent, single quotes, semicolons, trailing commas,
  LF line endings and a final newline (`.editorconfig`).
- **No brand names in code or strings.** Use `{brand}` or the branding settings.
- **Delete, don't comment out.** Old code is in git history. Remove unused files,
  exports, dependencies and translation keys as part of the change that stops
  using them.
- Old URLs that users may have bookmarked are kept as small redirect pages
  (tombstones) with a comment saying where the page moved.
