# Backend setup (Phase 1 + Phase 2)

This app's backend runs **inside Next.js itself** — API routes under
`app/api/`, using [Prisma](https://www.prisma.io) (v7) to talk to PostgreSQL.
There is no separate Node/Express server: `npm run dev` starts the frontend
*and* the backend together.

> **Note on Prisma 7:** this project uses Prisma ORM **7**, which changed
> quite a bit from earlier versions — the database URL now lives in
> `prisma.config.ts` (not in `schema.prisma`), and `PrismaClient` requires a
> "driver adapter" (`@prisma/adapter-pg` + `pg`) instead of connecting
> directly. All of that is already set up in this project — you shouldn't
> need to touch `prisma.config.ts` or `lib/db.ts`, this note is just so the
> file layout doesn't look unfamiliar if you've used older Prisma before.

## Prerequisites

- Node.js 18.18+ (whatever `next dev` already needs)
- PostgreSQL **18**, already installed on your system, running locally
  (default host `localhost`, default port `5432`)

## 1. Configure the database connection

```bash
cp .env.example .env
```

Open `.env` and set `DATABASE_URL` to your real local Postgres credentials:

```
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/whatsapp_cms?schema=public"
```

- `USERNAME` / `PASSWORD` — whatever you set up when you installed Postgres
  (often `postgres` / the password you chose during install).
- `whatsapp_cms` — the database name. It does **not** need to exist yet —
  Prisma's migration step below can create it for you, *if* the Postgres
  user has permission to create databases. If it doesn't, create an empty
  database called `whatsapp_cms` yourself first (e.g. with `psql` or
  pgAdmin), then re-run the migrate command.

## 2. Install dependencies

```bash
npm install
```

This also runs `prisma generate` automatically (via the `postinstall`
script), which generates the typed Prisma Client used throughout `lib/` and
`app/api/`.

## 3. Create the tables

```bash
npx prisma migrate dev
```

This will:
1. Create the `clients` and `sessions` tables (see `prisma/schema.prisma`).
2. Automatically run `prisma/seed.ts` (via `tsx`, per `prisma.config.ts`),
   which inserts 6 demo clients so you have something to log in with right
   away (see table below).

If you ever want to re-seed without a fresh migration:

```bash
npm run db:seed
```

## 4. Create the Super Admin account

There is exactly **one** Super Admin account in this app, and it is only
ever created from the terminal — there's no "Add Admin" button anywhere in
the UI, on purpose:

```bash
npm run create-admin
```

It'll ask for a User ID, your name, email, and a password (typed input is
hidden). Run this once. If you run it again later, it refuses — "an admin
already exists" — so you can't accidentally end up with two.

**Forgot the password?** There's no "forgot password" link in the UI either
(there's no email-sending set up, and it's a single local account) —
recover it from the terminal instead:

```bash
npm run reset-admin-password
```

## 5. Run it

```bash
npm run dev
```

Open http://localhost:3000/login.

## Seeded demo clients

| Client | User ID | Password | Status |
|---|---|---|---|
| Sharma Electronics | `sharma_admin` | `Demo@123` | Active |
| Nova Fashion House | `nova_admin` | `Demo@123` | Active |
| Green Leaf Organics | `greenleaf` | `Demo@123` | Active |
| Apex Fitness Studio | `apexfit` | `Demo@123` | Expired |
| Bluewave Travels | `bluewave` | `Demo@123` | Suspended (login blocked) |
| Demo Client Account | `clientdemo` | `Demo@123` | Active |

Super Admin now has a real, database-backed login too (set up in step 4
below) — nothing in this app is a hardcoded demo login anymore.

Create additional clients from **Super Admin → Clients → Add client** — the
User ID and password you type there work immediately, no re-seeding needed.

## What's real vs. still a demo

| Area | Backed by |
|---|---|
| Super Admin login | ✅ PostgreSQL + bcrypt password hash + httpOnly session cookie (one account only — see step 4) |
| Client CRUD (create/edit/suspend/activate) | ✅ PostgreSQL, via `app/api/clients/*`, requires a real Super Admin session |
| Client Admin login | ✅ PostgreSQL + bcrypt password hash + httpOnly session cookie |
| Password change (Settings, either role) | ✅ PostgreSQL, verifies current password first |
| Contacts, Templates, Campaigns, Bulk Sender, Inbox, Consent, Reports, Subscriptions, WhatsApp Setup | ⚠️ Still frontend-only / `localStorage` — not in this phase's scope |

## Known gaps (by design — read before deploying anywhere real)

This is Phase 1 + 2 of an agreed multi-phase plan. On purpose, it does
**not** yet include:

1. **No rate limiting / brute-force protection** on `/api/auth/login`
   (applies to both the admin and client login paths).
2. **No audit log** of who created/edited/suspended which client, or when
   the admin password was last changed.
3. **No "Add Admin" flow, and never will be by this design** — this isn't a
   gap so much as a deliberate constraint: this app supports exactly one
   Super Admin, provisioned and recovered from the terminal only
   (`npm run create-admin` / `npm run reset-admin-password`). If a real
   multi-admin product is ever needed, that's a bigger, separate feature
   (roles/permissions, invite flow, etc.) — not an oversight to silently fix.
4. Every other module (contacts, templates, campaigns, etc.) is still
   `localStorage`-based and has none of the above considerations yet either
   — they're simply out of scope for this phase.
5. `lib/customTemplates.tsx` and `lib/campaignStore.tsx` still seed a couple
   of sample rows against the **old** demo client ID (`"c6"`, from
   `data/clients.ts`). A real client created via the Clients page gets a
   different (database-generated) ID, so those specific sample rows won't
   show up for them — this is expected for now and will sort itself out once
   those modules move to the database in a later phase.

## Troubleshooting

**`Error: The datasource property 'url' is no longer supported in schema files` (P1012)** —
this means you're on Prisma 7 but `schema.prisma` still has `url = env(...)`
inside the `datasource` block. This project's `schema.prisma` already has
that removed — the URL lives in `prisma.config.ts` instead. If you see this,
you likely have an older/cached copy of `schema.prisma`; make sure you're
using the files from this zip.

**`prisma migrate dev` fails to connect** — double-check `DATABASE_URL` in
`.env`: right username/password, Postgres actually running, and the port
matches what you installed (`5432` unless you changed it). On Windows, you
can confirm Postgres is running via the "Services" app (look for
`postgresql-x64-18`) or:
```bash
pg_isready -h localhost -p 5432
```

**`permission denied to create database`** — your Postgres user isn't
allowed to create new databases. Create `whatsapp_cms` yourself first (e.g.
`CREATE DATABASE whatsapp_cms;` in `psql` or pgAdmin), then re-run
`npx prisma migrate dev`.

**`prisma generate` fails to download engine files** — this happens if your
network blocks `binaries.prisma.sh`. It should work fine on a normal
internet connection; if you're behind a restrictive corporate proxy/firewall,
allow that domain or see Prisma's docs on custom engine mirrors.

**Changed `prisma/schema.prisma` and want a fresh migration** — run
`npx prisma migrate dev` again; Prisma will generate a new migration file
and prompt you if it needs to.

**`npm run create-admin` says "an admin already exists"** — that's expected
if you've already run it once (this app only ever supports one Super Admin,
by design). Use `npm run reset-admin-password` to change the password
instead.

**Forgot the Super Admin password** — run `npm run reset-admin-password`
from the project folder on the machine/server where the database lives.

**Want to inspect the database visually** — `npm run db:studio` opens
Prisma Studio (a local GUI) at http://localhost:5555.
