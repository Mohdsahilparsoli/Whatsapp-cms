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
                        campaignRunner, campaignScheduler, nav config, utils,
                        subscription (still localStorage — not yet migrated)
prisma/                 schema.prisma (Client, Session, AdminUser,
                        AdminSession, Contact, CustomTemplate, Campaign), seed.ts
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
- **Bulk Sender** (`app/api/bulk-send/route.ts`) is "send now" only, with a
  live per-contact result list (sent/failed) after it finishes.
- **Campaigns** (`app/api/campaigns/*`) adds Draft / Send Now / **Schedule**,
  plus Edit and Delete:
  - Draft and Edit are always available for `draft`/`scheduled` campaigns.
  - "Send Now" runs the same send loop synchronously and returns the final
    result.
  - "Schedule" is picked up by an **in-process scheduler**
    (`lib/campaignScheduler.ts`) — a `setInterval` inside the Next.js server
    that checks every 30 seconds for due campaigns and sends them via
    `lib/campaignRunner.ts`. This is real, but only while the server process
    stays running (`npm run dev` / `npm start` kept up); it will not fire on
    a serverless host where the process can go idle between requests.
  - Delivered/read counts aren't tracked (`sentCount`/`failedCount` only) —
    that requires Meta's delivery-status webhooks, a separate, later phase.

## Notes

- Sidebar items change by role; every item links to a real page.
- Sidebar collapses on desktop and opens as a drawer on mobile.
- `tsconfig.json` sets `"@/*": ["./*"]` — keep that alias if you replace the file.
- Charts are drawn with plain CSS (`components/ui/ChartCard.tsx`), so no chart library is needed.
- Page titles, breadcrumbs, and the active sidebar item all come from `pageMeta`
  in `lib/nav.ts` — no page hardcodes its own title.
