# Public site (`apps/public-web`)

The Next.js site families, caregivers and overseas employers use. Served at `/`
in production, `http://localhost:3002` in development.

| Area | Routes |
|---|---|
| Landing and search | `/`, `/find`, `/caregivers/[publicId]` (Normal and AI search, map, profiles) |
| Registration and sign-in | `/register`, `/login`, `/caregiver/signup`, `/caregiver/login`, `/caregiver/claim`, WhatsApp and provider callbacks, password reset |
| Client account | `/account/*` - requests, bookings, ratings, invoices, saved caregivers, places, notifications, talk to a person |
| Caregiver portal | `/caregiver/(portal)/*` - dashboard, profile, documents, shifts, care offers, payments, ratings, notifications, work abroad |
| Overseas | `/international`, `/work-abroad/*`, `/employer/*`, `/talent/[slug]` |
| Other | `/agreements/*`, `/verify/[code]`, `/reference`, `/delete-account` |

## Run and check

```bash
# from the repo root
npm run dev:api
npm run dev:public-web
```

Copy `.env.example` to `.env.local`; `NEXT_PUBLIC_API_URL` points at the API.

```bash
npm test             # Jest + Testing Library (src/__tests__)
npm run typecheck
npm run build
```

## Where things are

- `src/app` - pages (App Router). `src/components` - UI by area.
- `src/lib/api` - the API client and auth context; `src/lib/hooks` - TanStack Query hooks.
- `src/lib/schemas` - Zod form schemas (`personal-info.ts`, `patient-intake.ts`).
- `src/lib/i18n/dictionaries/{en,si,ta}.json` - all strings; `dictionary-parity.test.ts`
  fails if the three languages' keys differ.

See [docs/architecture.md](../../docs/architecture.md) and
[docs/features.md](../../docs/features.md) for how sign-in, search and AI work.
