# WhatsApp Marketing CMS

**Status:** the Client module (Super Admin ⇄ Clients page), Client Admin
login, and Super Admin login all now run on a real PostgreSQL database.
Everything else (contacts, templates, campaigns, subscriptions, etc.) is
still frontend-only / `localStorage`, same as before. See
**README-BACKEND.md** for full backend setup instructions (Postgres, Prisma,
environment variables, and how to create the Super Admin account).

## Install & run

```bash
npm install                # installs deps + runs `prisma generate`
cp .env.example .env       # then edit .env with your local Postgres credentials
npx prisma migrate dev     # creates the tables (+ seeds demo clients)
npm run create-admin       # one-time: set up the Super Admin account
npm run dev
```

Open http://localhost:3000 — it redirects to `/login`. Full details, including
what to do if `prisma migrate dev` fails, are in **README-BACKEND.md**.

## Login

| Role | How many accounts | Created via | Backed by |
|---|---|---|---|
| Super Admin | Exactly one | `npm run create-admin` (terminal only) | **Real** — PostgreSQL, bcrypt-hashed |
| Client Admin | Any number | Super Admin → Clients → Add client | **Real** — PostgreSQL, bcrypt-hashed |

Nothing in this app is a hardcoded demo login anymore — see
README-BACKEND.md for the full list of seeded demo clients you can log in
with right away, and for how to create/recover the Super Admin account.

## Folder structure

```
app/
  layout.tsx            root layout + AuthProvider
  page.tsx               redirects to /login
  globals.css            Tailwind v4 entry
  login/page.tsx         login page
  api/auth/               login, logout, session, change-password (real, DB-backed, both roles)
  api/clients/            client CRUD, status, reset-password (real, DB-backed, Super-Admin-only)
  api/contacts/           contact CRUD, tags, bulk-tag, bulk-delete, import (real, DB-backed, Client-Admin-only)
  api/templates/          list, create, media upload (real, DB-backed, Client-Admin-only; no edit/delete yet)
  (app)/layout.tsx       protected shell (sidebar + topbar), redirects to /login if signed out
  (app)/dashboard        role-aware dashboard
  (app)/clients          super admin: clients management — now backed by PostgreSQL
  (app)/subscriptions    subscriptions (super admin = all, client = own)
  (app)/whatsapp-setup   WhatsApp account setup
  (app)/contacts         contacts — now backed by PostgreSQL (Phase A)
  (app)/contacts/import  contact import / fetcher
  (app)/templates        templates — Custom Templates now backed by PostgreSQL (Phase 1: create + list only)
  (app)/bulk-sender      bulk message sender
  (app)/campaigns        campaigns + create wizard
  (app)/queue            queue & rate limiting
  (app)/message-status   message status
  (app)/reports          reports & analytics
  (app)/inbox            WhatsApp inbox / live chat
  (app)/consent          consent & opt-out
  (app)/settings         settings — Password tab is real for both roles
components/layout/      AppLayout, Sidebar, MobileSidebar, Topbar
components/ui/          shared UI kit (DataTable, Modal, Drawer, InlineAlert, etc.)
components/dashboard/   SuperAdminDashboard, ClientAdminDashboard
components/forms/       ClientForm, ContactForm
components/subscription/ PlanCard, PlanComparison, CheckoutModal, SubscriptionBadge,
                        SubscriptionHistoryTable, TrialReminder, AccessGate
components/templates/   TemplateBuilder (real create, file upload), TemplatePreview,
                        TemplateSourceBadge
lib/                    auth (real, both roles — verifies against the server),
                        db (Prisma client), session + adminSession (login
                        cookies, one per role), passwords (bcrypt), apiGuards
                        (requireSuperAdmin, requireClient), contactMapper,
                        templateMapper, fileParse (client-side CSV/Excel
                        parsing), customTemplates (real create/list — see
                        Templates section below), campaignMapper,
                        campaignRunner, campaignScheduler, campaignValidation,
                        queueSettings, queueProcessor, messageMapper,
                        reportsAggregate, nav config, utils, subscription
                        (still localStorage — not yet migrated)
prisma/                 schema.prisma (Client, Session, AdminUser,
                        AdminSession, Contact, CustomTemplate, Campaign,
                        QueueSettings, QueueJob, MessageRecord), seed.ts
prisma.config.ts        Prisma 7 config — DB URL, migrations path, seed command
scripts/                create-admin.ts, reset-admin-password.ts — terminal-only
                        bootstrap/recovery for the single Super Admin account
data/                   mock data for modules not yet migrated to the database
types/                  shared TypeScript types
```

## Subscriptions & free trial

- Every new client account starts on a **14-day free CMS trial**. The Clients form
  pre-fills the trial window, and the Subscription page shows the trial start
  date, expiry date, and remaining days.
- Status badges are derived from the expiry date at runtime (never hardcoded):
  `Free Trial`, `Active`, `Expiring Soon` (≤ 3 days), `Expired`, `Suspended`.
- The Topbar shows a compact reminder for Client Admins only — "Your free trial
  expires in X days" / "…expires today" / "Your plan has expired" / "Your plan
  expires in X days". Clicking it opens the Subscription page.
- Three annual plans: Starter ₹2,999, Growth ₹7,999, Business ₹14,999. Feature
  limits shown are indicative and can be configured later by Super Admin.
- Once a trial or plan lapses, paid CMS pages render a "Subscription Expired"
  screen (`components/subscription/AccessGate.tsx`). Dashboard, Subscription, and
  Settings stay reachable so the client can always pick a plan.
- The checkout is **simulated** — there is no payment gateway. A success message
  only appears after the demo flow is completed.
- The Subscription page has a **Demo controls** card for previewing each trial
  state (new trial / expiring soon / expires today / expired / reset).

## Custom templates

- Templates page has three tabs: All Templates, Meta-Approved Templates, Custom
  Templates. Custom templates are scoped to the signed-in client and are never
  labelled "Meta Approved".
- The builder supports text, image/video/document media, header/footer, message
  variables ({{1}}, {{2}} …), URL buttons, WhatsApp chat buttons, a live preview,
  Save as Draft, and Save Template. Drafts are not sendable.

## Demo state & isolation

- Subscriptions, custom templates, and campaigns live in React context providers
  under `lib/`, persisted to `localStorage` (keys prefixed `wacms.demo.`).
- Every store filters and guards by `clientId`, so a Client Admin only ever sees
  and mutates their own data. Seed data deliberately includes a second client's
  template and campaign to make the isolation visible.
- To reset everything, use "Reset demo data" on the Subscription page or clear
  `localStorage` for the site.

## Client & Super Admin authentication (real)

- Client records live in **PostgreSQL** (`clients` table via Prisma). Super
  Admin's Clients page (Create / Edit / Suspend / Activate / Reset password)
  reads and writes the database through `app/api/clients/*`.
- Client Admin login is real: `POST /api/auth/login` checks the database and
  a bcrypt password hash, then sets an httpOnly session cookie. A client
  Super Admin creates can sign in immediately with the User ID and password
  given at creation.
- Super Admin login is also real, backed by its own `admin_users` table —
  but there is exactly **one** account, created once from the terminal
  (`npm run create-admin`) and never through the UI. See README-BACKEND.md
  for why, and for the recovery command if the password is forgotten.
- Either role can change their own password from **Settings → Password**
  (`POST /api/auth/change-password`) — the current password must match before
  a new one is accepted.
- `/api/clients/*` endpoints now verify a real Super Admin session
  (`lib/apiGuards.ts` → `requireSuperAdmin()`) before allowing any client
  create/edit/suspend/reset action — not just "caller isn't a client" like
  in the first pass of this work.

## Contacts (Phase A — real)

- Contacts live in **PostgreSQL** (`contacts` table), scoped to the signed-in
  client (`requireClient()` in `lib/apiGuards.ts` — Contacts is a
  Client-Admin-only area, Super Admin doesn't see it, matching the sidebar).
- **Phone is the only required field.** Name, email, tags, and consent are
  all optional.
- Tags are a plain string array per contact (no separate Tag table yet).
  `GET /api/contacts/tags` returns the distinct set in use, which powers the
  tag picker (`components/forms/ContactForm.tsx` → `TagPicker`) — pick an
  existing tag or type a new one.
- Delete is **real/permanent** (unlike Client, which is suspended rather
  than deleted) — there's a confirm dialog, but no undo.
- Bulk actions (tag, delete) are real too: `POST /api/contacts/bulk-tag` and
  `POST /api/contacts/bulk-delete`.
- **Contacts Phase B (not built yet):** CSV/Excel import, column mapping,
  and "saved contact lists" (`/contacts/import`) — still frontend-only mock
  data, deliberately deferred since saved lists will also tie into Campaigns.
- **Contacts Phase B (real now):** CSV/Excel import — `/contacts/import`
  parses the file **in the browser** (`lib/fileParse.ts`, using papaparse for
  CSV and SheetJS/`xlsx` for Excel), auto-guesses which column is phone/name/
  email/tags/consent (editable), shows a live preview + validation summary,
  then sends the mapped rows to `POST /api/contacts/import`. That endpoint
  normalizes and bulk-inserts them with `createMany({ skipDuplicates: true })`
  scoped to the signed-in client. Import-specific defaults (different from
  the plain Add Contact form): a missing/unrecognized consent value becomes
  `opted_in`, and a missing tags cell becomes the tag `normal`.
  "Saved contact lists" at the bottom of that page is still demo data —
  real saved lists are deferred until Campaigns is migrated, since lists are
  really a Campaigns concept (reusable audiences).
- The View drawer's "message history" is still demo data — it'll become
  real once Campaigns/messages are migrated.

## Templates (Phase 1 — Create + listing only)

- **Custom Templates** are real: stored in PostgreSQL (`custom_templates`
  table), scoped to the signed-in client (`requireClient()`, same as
  Contacts). **Meta-Approved Templates stay mock data** (`data/campaigns.ts`)
  — real Meta WhatsApp Business API sync is a separate, later phase.
- Phase 1 scope is deliberately **Create + listing only** — there is no Edit
  or Delete for custom templates yet (`app/api/templates/route.ts` only
  exports `GET`/`POST`). Add those (`PUT`/`DELETE /api/templates/[id]`) when
  that's needed.
- **Media is a real file upload**, not a URL field: `POST /api/templates/media`
  saves the file straight to this server's local disk under
  `public/uploads/templates/<clientId>/` (Next.js then serves it as a static
  file at the returned path), max **10MB**, restricted by type (image:
  jpg/png/webp/gif, video: mp4/webm/mov, document: PDF only). Because this
  writes to local disk, it only works on a persistent, self-hosted server —
  **not** on a stateless/serverless host like Vercel, where the filesystem
  doesn't persist between requests.
- **Buttons** support three kinds: URL, Call (phone number), and WhatsApp
  chat — up to 3 per template.
- The Templates page's `useCustomTemplates()` hook (`lib/customTemplates.tsx`)
  keeps the same interface Bulk Message Sender and Campaigns read from
  (`templates`, `views`) — Create, Edit (`PUT /api/templates/[id]`), and
  Delete (`DELETE /api/templates/[id]`) are all real now.

## Bulk Message Sender & Campaigns (real, with a shared limitation)

- Both pages send **real** WhatsApp messages via Meta's Graph API, using the
  same shared test-number credentials as `/api/whatsapp/send-test`
  (`META_TEST_PHONE_NUMBER_ID` / `META_TEST_ACCESS_TOKEN` in `.env`) — not
  yet a real per-client WhatsApp connection. A plain-text message only
  delivers to a recipient who has messaged that test number in the last 24
  hours (Meta's messaging-window rule).
- Only **saved (non-draft) Custom Templates** can be sent — Meta-Approved
  templates are still mock data and aren't real, registered Meta templates,
  so Meta would reject them.
- Audience is a **real** filter over the signed-in client's own Contacts:
  "all" opted-in contacts, or narrowed by one tag. No fake opt-out
  percentage — a contact is only included if its real `consent` is
  `opted_in`.
- Both **Bulk Sender** (`app/api/bulk-send/route.ts`) and **Campaigns**
  (`app/api/campaigns/*`) send through the real Queue & Rate Limiting system
  (`lib/queueProcessor.ts`) rather than looping directly — see that section
  below for what that means. Bulk Sender is "send now" only; Campaigns adds
  Draft / Send Now / **Schedule**, plus Edit and Delete:
  - Draft and Edit are always available for `draft`/`scheduled` campaigns.
  - "Send Now" runs the send synchronously and returns the final result.
  - "Schedule" is picked up by an **in-process scheduler**
    (`lib/campaignScheduler.ts`) — a `setInterval` inside the Next.js server
    that checks every 30 seconds for due campaigns and sends them via
    `lib/campaignRunner.ts`. This is real, but only while the server process
    stays running (`npm run dev` / `npm start` kept up); it will not fire on
    a serverless host where the process can go idle between requests.

## Queue & Rate Limiting (real)

- `QueueSettings` (per client: messagesPerMinute, batchSize,
  maxRetryAttempts, paused) and `QueueJob` (one row per batch) are real
  tables — see `lib/queueProcessor.ts`.
- Every real send (Campaigns, Bulk Sender) is split into batches of
  `batchSize` contacts, and each send inside a batch is spaced out to
  respect `messagesPerMinute` — this is a genuine, working rate limit, not a
  cosmetic delay.
- A batch where **every** message failed is marked `failed` and is
  retryable from the Queue page (`POST /api/queue/jobs/[id]/retry`), up to
  `maxRetryAttempts`. A batch with some individual failures is `completed`
  (those failures are just recorded, not auto-retried).
- **Pause** (`POST /api/queue/pause`) stops NEW sends from starting — a
  scheduled campaign whose time comes while paused is left as `scheduled`
  so the scheduler picks it back up once resumed, instead of silently
  failing it.

## Message Status (real send tracking + real, optional webhook)

- Every individual send attempt from the queue (success or failure) creates
  a real `MessageRecord` row — see `lib/queueProcessor.ts`'s
  `recordMessage()`. A retry updates the same row (matched on
  `queueJobId` + `recipientPhone`) rather than duplicating it.
- Status starts at `sent` or `failed`. Reaching `delivered`/`read` requires
  Meta's real delivery-status webhook, which this app implements at
  `app/api/webhooks/meta/route.ts` (`GET` for the one-time verification
  handshake, `POST` for status updates) — but that endpoint only ever
  receives anything if:
  1. This server is reachable on a **public HTTPS URL**. `npm run dev`
     alone only listens on localhost, which Meta cannot reach — use
     [ngrok](https://ngrok.com) (`ngrok http 3000`) for local development,
     or a real deployment.
  2. That public URL + a `META_WEBHOOK_VERIFY_TOKEN` you make up (put the
     same value in `.env` and the Meta dashboard) are saved as this app's
     webhook in **Meta App Dashboard → WhatsApp → Configuration →
     Webhooks**, subscribed to the `messages` field.
  Without that setup, every message will only ever show `sent`/`failed` —
  expected, not a bug.
- The webhook always responds `200`, even on an internal error while
  processing a payload, because Meta can disable a webhook that repeatedly
  errors or times out.

## WhatsApp Account Setup (real — two connect methods)

Real, per-client WhatsApp Business Account storage (`WhatsAppAccount` model,
one row per client), replacing the shared `META_TEST_*` env vars used
everywhere else so far. Two ways to connect, both real:

- **Enter manually** (`POST /api/whatsapp-setup/connect-manual`) — paste a
  WABA ID, Phone Number ID, and access token (from Meta's own API Setup
  page). We call Meta's API with those credentials *before* saving anything
  — only a real, working token gets stored. **Works today**, no extra Meta
  configuration needed.
- **Connect via Facebook** (Embedded Signup) — `app/(app)/whatsapp-setup/page.tsx`
  loads Meta's JS SDK and calls `FB.login()` with a Login Configuration id;
  the resulting authorization `code` plus the WABA/phone number id (which
  arrive separately, via a `window.postMessage` event Meta's popup sends)
  are both sent to `POST /api/whatsapp-setup/connect`, which exchanges the
  code for a real access token, fetches the phone number's real details,
  and subscribes this app to that WABA's webhooks. **Needs**, before it'll
  actually work: (1) Meta App Review approved for `whatsapp_business_management`
  advanced access, (2) a WhatsApp Embedded Signup Login Configuration
  created in the Meta App Dashboard (Facebook Login for Business →
  Configurations) with its id set as `NEXT_PUBLIC_META_CONFIG_ID`, and (3)
  `NEXT_PUBLIC_META_APP_ID` / `META_APP_SECRET` in `.env`. Until then, the
  code is correct and ready — Meta's own popup will show its own error, or
  the token exchange will fail with a real Meta error, which is expected.

Credentials are encrypted at rest (`lib/crypto.ts`, AES-256-GCM, key from
`CREDENTIALS_ENCRYPTION_KEY` in `.env`) and only ever shown masked
(`EAAP••••b905`) after saving — never in full again. The setup checklist on
the page is also real and persisted per client (`checklistDone`), though it
tracks the user's own manual progress, not anything Meta can confirm from
our side.

**Now wired in**: `lib/whatsappCredentials.ts`'s `getWhatsAppCredentials(clientId)` is the
single place every real send resolves which number to use from — a client's own connected
account if `WhatsAppAccount.connected` is true, else the shared `META_TEST_*` fallback. Every
sending code path goes through it: `app/api/whatsapp/send-test` and `send-media` (Inbox) call
it directly; Campaigns and Bulk Sender both go through `lib/queueProcessor.ts`'s `sendBatch()`,
which now calls it too — so connecting an account in WhatsApp Account Setup takes effect
everywhere at once, with no per-feature changes needed. If the stored token can't be decrypted
(e.g. `CREDENTIALS_ENCRYPTION_KEY` changed since they connected), sends quietly fall back to the
shared number rather than hard-failing.

## Inbox — real ticks, real sending, AND real receiving

- Text replies (`/api/whatsapp/send-test`) and photo/document sends
  (`/api/whatsapp/send-media`) create a real `MessageRecord` (for Message
  Status/Reports) **and** a real `Conversation` + outbound `ChatMessage`
  (for the Inbox thread itself) — so the Inbox now reads from real,
  persisted conversations (`app/api/inbox/*`), not seeded mock data.
- **Real incoming messages**: `app/api/webhooks/meta/route.ts` now also
  processes `change.value.messages` (previously only delivery/read
  statuses). For each incoming message it:
  1. Resolves which **client** it belongs to, by matching the webhook's
     `metadata.phone_number_id` against that client's connected
     `WhatsAppAccount.phoneNumberId` (WhatsApp Account Setup) — this is
     what makes per-client routing possible now that accounts are real,
     solving the multi-tenant ambiguity noted earlier in this file.
  2. Finds-or-creates that client's `Conversation` for the sender's phone,
     and creates an inbound `ChatMessage`.
  3. A message to a phone number **nobody has connected yet** has no client
     to attribute it to and is dropped — expected, not a bug, until that
     number is connected in WhatsApp Account Setup.
  - Incoming image/document messages are recorded with any caption/filename
    Meta sends, but the actual file isn't downloaded/re-hosted yet — shown
    as a placeholder ("📷 Photo received (not downloaded)"), a reasonable
    follow-up if you need it.
- Ticks (✓ sent, ✓✓ delivered, ✓✓ blue read) now update by simply re-polling
  the conversation's real messages every 4s — the webhook's status handler
  updates the matching outbound `ChatMessage.status` directly by
  `whatsappMessageId`, alongside the existing `MessageRecord` update.
- **Still requires the same public-URL webhook setup** described earlier in
  this file (ngrok for local dev) — without it, the Inbox stays empty even
  if messages genuinely arrive on WhatsApp, same as delivered/read staying
  stuck at "sent".
- The paperclip button uploads a photo (jpg/png/webp) or document
  (pdf/doc/docx/xls/xlsx/txt) via `POST /api/whatsapp/upload` (saved to
  local disk under `public/uploads/inbox/<clientId>/`, same tradeoff as
  Template media — self-hosted only, not serverless), then sends it via
  `POST /api/whatsapp/send-media`. Meta's servers fetch the file from the
  URL you send them, so this only works if this app is reachable on a
  public URL — on `localhost` the upload succeeds but the WhatsApp send
  will fail (same requirement as the webhook). Text messages don't have
  this limitation.

## Client Admin Dashboard + Notifications bell (real)

- `GET /api/dashboard/client` powers the whole dashboard: real contact
  count, active-campaign count, Sent/Delivered/Read/Failed totals (via the
  same `aggregateTotals()` Reports uses), the 5 most recent real campaigns,
  and the 4 most recent real `MessageRecord`s ("Recent messages" — replaces
  the old fake "Recent inbox conversations" list, since Inbox's incoming
  side still isn't real; see that section's own README note above).
- "WhatsApp connection" is now labeled honestly as a shared test number
  rather than a fake "Connected" badge, since real per-client connections
  are the still-pending WhatsApp Account Setup phase.
- Subscription section is unchanged — still `lib/subscription.tsx`
  (localStorage), out of scope here.
- The header's notification bell (`components/layout/Topbar.tsx`) now calls
  `GET /api/notifications`, which computes real notifications on the fly —
  no separate table. For a Client Admin: campaigns that finished in the
  last 7 days (with real sent/failed counts), batches that failed in the
  last 7 days, and a pending-drafts count. For Super Admin: clients added
  in the last 7 days. Refetched every 60s; the unread dot only shows when
  there's something real to show.

## Settings (all 4 tabs real)

- **Profile**: `PUT /api/auth/profile` — name/email/phone save to the
  signed-in user's real row (`Client` or `AdminUser`), for both roles.
  Saving refreshes the header/sidebar immediately via `useAuth()`'s new
  `updateUser()`, without a full session refetch.
- **Password**: unchanged — already real (`POST /api/auth/change-password`).
- **Notifications** (`PUT /api/settings/notifications`) and **Preferences**
  (`PUT /api/settings/preferences`): stored as JSON columns
  (`notificationPrefs`, `cmsPrefs`) on `Client`/`AdminUser` — simple
  per-user key/value settings with no query needs of their own, same
  reasoning as `CustomTemplate.buttons`. Null until saved once; the
  frontend applies its own defaults until then. `GET /api/auth/session` and
  `POST /api/auth/login` both return these on `user.notifications` /
  `user.preferences`, so they're available immediately without an extra
  fetch.

## Consent & Opt-out (real)

- Reads and writes the same real `Contact` rows as the Contacts page — this
  is a view/action page over that data, not a separate table.
- "Mark opted in" / "Opt out" call the existing `PUT /api/contacts/[id]`,
  which now auto-updates `consentDate` (to now) and `consentSource` (to
  `"Manual — Consent page"` unless the caller passes a different source)
  whenever `consent` actually changes — editing unrelated fields elsewhere
  (name, tags, ...) never silently resets these.
- Opted-out contacts are genuinely excluded from Campaigns/Bulk Sender —
  both only ever query contacts whose real `consent` is `opted_in`.

## Reports & Analytics (real)

- Built entirely from real `MessageRecord` rows — no mock numbers anywhere,
  including the CSV export.
- Client Admin (`GET /api/reports`): totals, a 7-day chart, and a
  per-campaign performance table for their own client only, with a real
  date-range and campaign filter.
- Super Admin (`GET /api/reports/admin`): the same totals/chart across
  **every** client, plus a real "top clients by volume" ranking —
  aggregated live from `MessageRecord` counts grouped by `clientId`, not
  the static `Client.messagesSent` field (which is unrelated, see that
  field's comment in `schema.prisma`).
- "Recipients" = total message attempts (each `MessageRecord` row is one
  send to one recipient); "Delivered"/"Read" only count what Meta's webhook
  has actually confirmed — same caveat as Message Status above.

## Notes

- Sidebar items change by role; every item links to a real page.
- Sidebar collapses on desktop and opens as a drawer on mobile.
- `tsconfig.json` sets `"@/*": ["./*"]` — keep that alias if you replace the file.
- Charts are drawn with plain CSS (`components/ui/ChartCard.tsx`), so no chart library is needed.
- Page titles, breadcrumbs, and the active sidebar item all come from `pageMeta`
  in `lib/nav.ts` — no page hardcodes its own title.
