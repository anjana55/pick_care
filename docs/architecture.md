# Architecture

Pick Care is an npm-workspaces monorepo: one API, two web apps, one mobile app and
a shared package. Every client talks to the same REST API; nothing is shaped around
one UI.

```
               nginx (deploy/)
browser ──┬── /          → apps/public-web  (Next.js)  ─┐
          ├── /staff     → apps/web         (Next.js)  ─┤
          └── /api/      → apps/api         (NestJS)  ←─┤
phone ──────── apps/mobile (Expo) ─────────────────────┘
                              │
                              ├── MySQL 8 (Drizzle ORM)
                              └── document storage (StorageService → local disk)
```

## Apps

| App | Audience | Notes |
|---|---|---|
| `apps/api` | Everyone, through the apps | NestJS 11. Swagger/OpenAPI at `/docs` (`/api/docs` behind nginx), generated from the controllers and DTOs. |
| `apps/public-web` | Families, caregivers, overseas employers | Search (normal and AI), registration and sign-in, the client account (`/account/*`), the caregiver portal (`/caregiver/*`), the employer area (`/employer/*`), work-abroad pages and shareable talent profiles. |
| `apps/web` | Office staff and admins | Served under the `/staff` base path. Requests, bookings, care plans, caregivers, clients, invoices and payouts, reviews, overseas recruitment, the assistant and agent proposals, and every Settings page. A few old caregiver routes (`/register`, `/login/whatsapp`, `/verify-email`, `/me`) are kept only as redirects to the public site. |
| `apps/mobile` | Caregivers and clients | Expo SDK 58 / React Native 0.88, Expo Router. One app for both audiences; staff and employer accounts are refused. See `apps/mobile/README.md`. |
| `packages/shared` | All of the above | Types for every API contract, value lists, money and date helpers, and the i18n engine (`@care-platform/shared/i18n`). Built to `dist/` for Node; the mobile app reads its TypeScript source directly. |

## API modules (`apps/api/src`)

Each folder is a Nest module with its controller, service, DTOs and unit tests
(`*.spec.ts`) side by side. End-to-end suites against a real database are in
`apps/api/test`.

| Area | Modules |
|---|---|
| Accounts and sign-in | `auth` (email/password, WhatsApp OTP, Google/Microsoft/Facebook, claim codes, portals), `whatsapp`, `users`, `account-access`, `account-deletion`, `communication-preferences` |
| Caregivers | `caregivers`, `qualifications`, `experiences`, `caregiver-skills`, `caregiver-languages`, `availability`, `preferred-locations`, `references`, `documents`, `verification`, `health-information`, `onboarding` (document reading), `reviews` |
| Clients | `patients`, `clients`, `care-locations`, `intake` |
| Finding care | `public-search`, `matching`, `geo`, `locations` |
| Requests and work | `care-requests`, `offers`, `cover`, `bookings` (shifts, check-in, live location sharing), `care-plans`, `corrections` (amending completed bookings), `talk` ("talk to a person") |
| Money | `billing` (invoices, payments, payouts, PayHere), `pricing` |
| Overseas | `international` (employers, vacancies, enquiries, training, placements) |
| Automation and AI | `automation` (agents, the per-action gate and manual fallback), `ai` (providers, public AI search, staff assistant), `jobs` (durable background work), `insights` |
| Messaging | `notifications` (in-app bell), `push` (Expo push), `email` |
| Settings and platform | `branding`, `mobile-app`, `ads`, `analytics`, `data-transfer` (spreadsheet import/export), `skills`, `languages`, `audit`, `storage`, `database`, `common` |

`common/` holds what every module uses: guards and decorators (`@Roles()`,
`@CaregiverScope()`, `@CurrentUser()`), validation helpers, the global exception
filter and response interceptor that translate messages, and environment
validation.

## Data

- **MySQL 8**, accessed through **Drizzle ORM** and `mysql2`. The schema is in
  `apps/api/src/database/schema/*.ts`, one file per area, re-exported from
  `schema/index.ts`.
- **Migrations** are committed SQL in `apps/api/src/database/migrations/`
  (numbered, with Drizzle's snapshots in `meta/`). `db:generate` writes the next
  one from a schema change; `db:migrate` applies pending ones; production runs
  them from `setup.sh` / `update.sh`. Never edit a migration that has shipped.
- **Reference data** (provinces, districts and cities in English, Sinhala and
  Tamil) lives in `apps/api/src/database/seed-data/*.csv` and is loaded by the
  seed scripts.
- Database sessions run in UTC; business dates are Sri Lanka time
  (`Asia/Colombo`, no daylight saving), using the helpers in `packages/shared`.
- Money is stored and calculated in cents.

## Accounts, roles and portals

Roles: `ADMIN`, `STAFF`, `VERIFIER` (office), `CAREGIVER`, `PATIENT_GUARDIAN`
(client) and `EMPLOYER` (overseas employer).

- Short-lived JWT access tokens and rotating, hashed refresh tokens.
- Three sign-in portals - staff, caregiver, customer - each accepting only its
  own kind of account; a wrong-portal sign-in fails exactly like a wrong password
  (see [features.md](features.md#sign-in-portals-and-message-language)).
- Caregivers reach only their own records through `@CaregiverScope()`.
- Sensitive reads and every change of consequence are written to `audit_logs`.

## Languages

English, Sinhala and Tamil everywhere:

- Each app has its own dictionaries: `apps/web/src/lib/i18n/`,
  `apps/public-web/src/lib/i18n/dictionaries/`, `apps/mobile/src/i18n/`. All three
  languages must have identical keys (tests enforce it).
- `{brand}` in any string is replaced with the configured company name, so no
  string hard-codes a brand.
- The API answers in the language asked for (`?lang=` or `Accept-Language`);
  its messages are in `apps/api/src/common/i18n/messages.ts`, with a test that
  fails when a new message has no translation.
- The mobile app's iOS permission prompts are in `apps/mobile/locales/` (Sinhala,
  Tamil) and `app.config.ts` (English).

## Branding (white label)

`GET /branding` serves the company name, short name, logo, colours, enabled
languages and per-language text size from **Settings > Branding**. The web apps
and the mobile app read it at start-up, so a change shows without a redeploy.
The mobile app's store name, bundle id, icon and splash screen are baked into a
build per brand (`apps/mobile/app.config.ts`, `npm run brand:assets`).

## Background work

`jobs` keeps durable background work (offers, reminders, check-in follow-ups,
payout drafts) in MySQL, so a restart never loses a step and no extra server
software is needed. Each job has a unique key, so scheduling is idempotent.
Agents in `automation` run through the same services the staff pages use; each
action is gated per setting as off, shadow, propose (staff approve) or automatic.

## Files

Documents and photos go through the `StorageService` interface
(`apps/api/src/storage/storage.interface.ts`: `upload`, `download`, `delete`,
`getSignedUrl`), implemented today by local disk storage. Storage keys are
server-generated, the folder is never served directly, uploads are checked by
type, extension, file signature and size, and every read is audit-logged. Moving
to S3 or similar means a new implementation of that interface.

## Deployment

Production is Docker Compose (`docker-compose.prod.yml`) behind nginx, installed
and updated by `setup.sh` / `update.sh`. Images can be built on the server or
prebuilt by `.github/workflows/images.yml`. See [DEPLOYMENT.md](../DEPLOYMENT.md).
