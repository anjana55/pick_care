# Feature reference

Behaviour and rules that span the API and the apps. The interactive list of every
endpoint is Swagger, at `/docs` on a running API (`/api/docs` behind nginx).

- [Registration](#registration)
- [Sign-in with WhatsApp](#sign-in-with-whatsapp)
- [Sign-in with Google, Microsoft and Facebook](#sign-in-with-google-microsoft-and-facebook)
- [Sign-in portals and message language](#sign-in-portals-and-message-language)
- [Clients and the staff Clients list](#clients-and-the-staff-clients-list)
- [Caregiver search in the staff app](#caregiver-search-in-the-staff-app)
- [AI](#ai)
- [Security](#security)

## Registration

Clients (`/register`) and caregivers (`/caregiver/signup`) register in two steps,
on the public site and in the mobile app alike:

1. **How they will sign in** - WhatsApp, Google / Microsoft / Facebook, or email
   and password.
2. **One form about them** (and, for clients, the care they need), leaving out
   anything the sign-in or their search already provided - for example the phone
   number when WhatsApp has just verified it. Both accept the service agreement
   for their side (`/agreements/client`, `/agreements/caregiver`).

Anyone who would rather not fill in a form can choose **call the office** and be
registered by staff instead.

WhatsApp and provider sign-ups finish signed in; an email sign-up confirms the
address by link first. A caregiver who registered but never secured the account,
or whom the office registered, finishes at `/caregiver/claim`: registration
number, then a code sent to the phone or email on record (or given by staff), then
a sign-in method. That page never confirms whether a number exists.

Old registration URLs (`/caregiver/join`, `/caregiver/register`, and `/staff/register`
in the staff app) redirect to the current pages. On the API, the current flow is
`SignupService` (`apps/api/src/auth/signup.service.ts`); the older routes
(`/auth/register-patient`, `/auth/register-caregiver`,
`/auth/register-caregiver/unified`, `/auth/whatsapp/register-*`) keep working for
app versions already installed on phones, so do not remove them until those
versions are retired in **Settings > Mobile app**.

## Sign-in with WhatsApp

Caregivers and clients without an email address can register and sign in with a
**one-time code sent over WhatsApp**. A WhatsApp account has the same user row,
role, profile, token claims and permissions as an email account. The feature is
**off until an admin turns it on**.

| Endpoint (public, rate-limited) | Purpose |
| --- | --- |
| `GET /auth/whatsapp/config` | What the sign-in screens may offer (no secrets) |
| `POST /auth/whatsapp/request-otp` | Send a `REGISTER` (re-send), `LOGIN` or `RECOVERY` code |
| `POST /auth/whatsapp/verify-otp` | Check a code; on success returns the normal token pair |

- **Recovery** works like login with a `RECOVERY` code, and **revokes every other
  session** (for a lost phone).
- WhatsApp-only accounts have no password; email login and *change password*
  refuse them. Office accounts can never use WhatsApp.
- **Duplicates:** numbers are normalised to E.164 (`0771234567`,
  `+94 77 123 4567` and `94771234567` are one number) and a number already on a
  WhatsApp login, caregiver or client profile is refused with `409`. A sign-up that
  never finished its code is replaced rather than blocking the real owner.
- **Codes** come from a CSPRNG, are stored only as a keyed HMAC, are single-use,
  expire (default 5 minutes) and lock after a set number of wrong guesses
  (default 5); only the newest code works. Sending is limited by a resend
  cooldown, an hourly cap and per-IP throttling. Responses are identical for
  registered and unregistered numbers, and every kind of bad code gives the same
  error.
- **Settings > WhatsApp** (admin only, `GET/PATCH /settings/whatsapp`, audit-logged):
  master and per-flow switches, WhatsApp Business Cloud API credentials, the
  approved authentication template, code policy, default country code and a
  **Send test** button. The access token is encrypted at rest and never returned.
  `WHATSAPP_*` environment variables only seed this the first time.
  DEPLOYMENT.md §8.5 covers the Meta side.
- For local development pick the **Console** provider: codes are written to the API
  log and returned as `devOtp`. It is refused when `NODE_ENV=production`.

## Sign-in with Google, Microsoft and Facebook

- `GET /auth/social/:provider/authorize-url` (sign-up) and
  `GET /auth/social/:provider/login-url?nonce=` (returning users) return the
  provider's consent URL with a signed `state`.
- `GET /auth/social/:provider/callback` checks the state and links or finds the
  account by the provider's **stable account id, never by email**. Sign-in never
  creates an account; an unlinked provider account is sent to registration. If the
  person gave an email, the provider's verified email must match it.
- The callback redirects with a single-use, 60-second handoff code, which the page
  trades for tokens with `POST /auth/social/exchange`, so tokens never appear in a
  URL. For sign-in, the page also checks that the nonce it stored in this tab came
  back.
- One callback URL serves sign-up and sign-in, so each provider needs one redirect
  URI.
- **Settings > Social sign-in** (admin only): per provider, on/off, client id,
  client secret (encrypted, never shown again), Microsoft tenant, Facebook Graph
  API version, the callback URL to register, and **Test credentials**
  (`GET /settings/social-auth`, `PATCH /settings/social-auth/:provider`,
  `POST /settings/social-auth/:provider/test`). A provider's button shows only
  when it is on and has both an id and a secret. `GOOGLE_*`, `MICROSOFT_*` and
  `FACEBOOK_*` environment variables only seed a provider the first time.
- When a provider rejects a request, only its error code is logged; its
  description can echo the client secret, so it is neither logged nor returned.

## Sign-in portals and message language

**Portals.** Each place to sign in serves only its own accounts:

| Portal | Screen | Accounts |
|---|---|---|
| `staff` | `/staff/login` | ADMIN, STAFF, VERIFIER |
| `caregiver` | `/caregiver/login` (+ WhatsApp, Google / Microsoft / Facebook), mobile app | CAREGIVER |
| `customer` | `/login` (+ WhatsApp, Google / Microsoft / Facebook), mobile app | PATIENT_GUARDIAN |
| employer | `/employer/login` | EMPLOYER |

`POST /auth/login` takes a `portal`. Correct credentials for another portal's account
are refused **exactly like a wrong password** (same status, body and
`"Invalid credentials"`), no session is created, and the attempt is audit-logged as
`LOGIN_WRONG_PORTAL`. The check runs right after the password is proven, so nothing
else about the account is revealed. Every login screen links to the other sign-ins.
Set `AUTH_REQUIRE_LOGIN_PORTAL=true` to reject sign-ins that send no portal.

**Language.** Every message the API returns - errors from services, guards and
validation, and the `message` of a success body - comes in English, Sinhala or
Tamil, chosen by `?lang=en|si|ta` or the `Accept-Language` header (`lang` wins;
anything unsupported falls back to English). Responses carry `Content-Language` and
`Vary: Accept-Language`. The translations are in
`apps/api/src/common/i18n/messages.ts`, applied by one exception filter and one
response interceptor; services keep throwing plain English. A unit test fails when
a new message has no translation and is not listed as exempt in
`messages.coverage.spec.ts`.

## Clients and the staff Clients list

A client is a `PATIENT_GUARDIAN` user with a `patients` profile. The care intake
(who needs care, contact, location, care needs and schedule) is defined once in
`apps/api/src/auth/dto/patient-profile.dto.ts` and stored by one helper
(`apps/api/src/clients/patient-profile.util.ts`), so every registration route
behaves the same. Intake columns are nullable in the database because early
clients have none of them; the DTOs make them required for new sign-ups.

`GET /clients` (paginated, with search, location, schedule, start, contact method,
registrant type, verification and sorting) and `GET /clients/:id` are **ADMIN and
STAFF only**. Contact details are returned unmasked - calling the client is the
point - so opening a record is audit-logged as `VIEW_CLIENT`.

## Caregiver search in the staff app

`GET /caregivers` accepts, all optional and combinable with AND:

| Param | Semantics |
|---|---|
| `search` | Name, registration number or phone |
| `status`, `gender` | Exact match |
| `skillIds`, `languageIds` | Caregiver has **all** of them |
| `locationIds` | Caregiver prefers **any** of them |
| `dayDuty`, `nightDuty`, `liveIn24h` | Availability matches **any** checked flag |
| `page`, `pageSize`, `sortBy`, `sortDir` | Paging and sorting |

An impossible combination returns an empty page. All-of matching uses
`GROUP BY ... HAVING COUNT(DISTINCT ...) = N` on the join tables to avoid row
fan-out (see `CaregiversService.findAll`). The public site's search is a separate,
anonymised API (`/public/search`, `/public/caregivers/:publicId`).

## AI

Configured in **Settings > AI** (admin only, `GET/PATCH /settings/ai`) and **off by
default**; every page and rule-based search works without it.

- **Providers:** Ollama, any OpenAI-compatible endpoint (OpenAI, vLLM, LM Studio,
  OpenRouter) or Anthropic. Model, endpoint, key (encrypted with
  `SETTINGS_ENCRYPTION_KEY`, never returned), temperature, limits, candidate pool
  size and extra instructions are editable; `POST /settings/ai/test` checks the
  saved configuration, including tool calling.
- **Public AI search** (`POST /public/ai/extract`, `POST /public/ai/search`): the
  visitor's words become the same structured request Normal Search uses, checked
  against the catalogue, and shown to the visitor to confirm. The model only
  re-orders the top matches, seeing their anonymous public cards, and adds a
  one-line reason in the visitor's language. Any model failure falls back to the
  rule-based order.
- **Caregiver suggestions** for a request (`GET /care-requests/:id/suggestions`),
  rule-based, refined by AI when it is on.
- **Staff assistant** (`/staff/assistant`): a tool-calling chat over requests and
  bookings. Look-ups run at once; every change is a proposal the staff member
  approves, which then runs the same service method as the page, with the same
  validation, notifications and audit entries (`metadata.via = "assistant"`).
  Tool results never include phone numbers, emails, addresses or ID numbers.
- **Agents** (Settings > Automation): per-function agents whose actions are each
  set to off, shadow (log only), propose (staff approve) or automatic, with a
  manual fallback. Proposals wait in **Agent proposals** in the staff app.

## Security

- JWT access tokens (15 minutes) and rotating refresh tokens (7 days, hashed,
  revoked on use and logout); bcrypt passwords (cost 12).
- Role-based access with `@Roles()`; caregivers limited to their own record with
  `@CaregiverScope()`.
- Helmet headers, configurable CORS, rate limiting, class-validator on every
  endpoint.
- NIC, passport and phone numbers are masked in caregiver lists; health
  information is a separate table, never joined into ordinary responses, and
  restricted to ADMIN and VERIFIER (and the caregiver themself).
- Uploads: type, extension and file-signature checks, a 10 MB cap,
  server-generated storage keys, never served directly.
- Secrets saved in Settings (WhatsApp, social sign-in, AI, payment) are encrypted
  at rest with `SETTINGS_ENCRYPTION_KEY` and never returned by the API.
- Sign-in, profile and status changes, document access, health-information access
  and other sensitive actions are written to `audit_logs`.
