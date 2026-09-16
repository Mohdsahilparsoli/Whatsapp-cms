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
  (app)/layout.tsx       protected shell (sidebar + topbar), redirects to /login if signed out
  (app)/dashboard        role-aware dashboard
  (app)/clients          super admin: clients management — now backed by PostgreSQL
  (app)/subscriptions    subscriptions (super admin = all, client = own)
  (app)/whatsapp-setup   WhatsApp account setup
  (app)/contacts         contacts
  (app)/contacts/import  contact import / fetcher
  (app)/templates        templates
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
components/templates/   TemplateBuilder, TemplatePreview, TemplateSourceBadge
lib/                    auth (real, both roles — verifies against the server),
                        db (Prisma client), session + adminSession (login
                        cookies, one per role), passwords (bcrypt), apiGuards
                        (requireSuperAdmin), nav config, utils, subscription/
                        customTemplates/campaignStore (still localStorage —
                        not yet migrated)
prisma/                 schema.prisma (Client, Session, AdminUser,
                        AdminSession), seed.ts
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

## Notes

- Sidebar items change by role; every item links to a real page.
- Sidebar collapses on desktop and opens as a drawer on mobile.
- `tsconfig.json` sets `"@/*": ["./*"]` — keep that alias if you replace the file.
- Charts are drawn with plain CSS (`components/ui/ChartCard.tsx`), so no chart library is needed.
- Page titles, breadcrumbs, and the active sidebar item all come from `pageMeta`
  in `lib/nav.ts` — no page hardcodes its own title.
