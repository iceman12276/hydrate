# Hydrate — Implementation Plan

Hydrate is an installable PWA for logging water intake, tracking progress toward a daily goal, reviewing history/streaks, and receiving scheduled web-push reminders that respect each user's timezone, active window, and quiet hours. It runs as a Next.js 15 App Router app on Vercel with Supabase (Postgres + Auth + Edge Functions + pg_cron) as the single source of truth. The build philosophy is deliberately lean: native platform features and Supabase built-ins over custom infrastructure, four database tables, Row Level Security as the real authorization boundary, and per-user timezone correctness treated as non-negotiable. This plan folds in every fix from the data-model and push-pipeline reviews so the two launch-blocking bugs (signup-breaking CHECK violation, and reminders firing in the wrong zone / never firing) are resolved by design.

---

## Diagrams

Visual companions to this plan. Each lives in [`diagrams/`](diagrams/) as an editable **`.drawio`** source, a crisp **`.svg`**, and the embedded-XML **`.drawio.png`** shown below (open any `.drawio.png` in draw.io to edit it).

### 1. System Architecture — runtime components & data flows
![System Architecture](diagrams/01-architecture.drawio.png)

### 2. Data Model (ERD) — four tables, RLS, relationships
![Data Model ERD](diagrams/02-data-model-erd.drawio.png)

### 3. Reminder & Web-Push Pipeline — the cron → Edge Function → push path (and device enrollment)
![Reminder and Web-Push Pipeline](diagrams/03-reminder-push-pipeline.drawio.png)

### 4. Build Roadmap — milestones M0–M8 with dependencies
![Build Roadmap](diagrams/04-build-roadmap.drawio.png)

### 5. User Flow — screen journey
![User Flow](diagrams/05-user-flow.drawio.png)

---

## 1) Overview & Goals

**Goal:** the simplest app that genuinely helps someone hit a daily water goal and actually get reminded.

**V1 scope (in):**

| # | Capability |
|---|------------|
| 1 | Quick-add logging (common amounts + custom) |
| 2 | Daily goal + live progress (ring + remaining) |
| 3 | History/stats: today, last 7/30 days, streak |
| 4 | Reminder config: interval OR fixed times, active window, quiet hours, per-user timezone, enable/disable |
| 5 | Web-push delivery on schedule (installable PWA + service worker) |
| 6 | Account & settings: units (ml/oz), goal, profile, device management |

**Never cut:** auth/RLS correctness, input validation, per-user timezone correctness, accessibility.

**Non-goals (v1):** email channel, gamification/social, multi-beverage, Realtime cross-device sync, offline write queue, account self-deletion. All labeled "later" (§12).

---

## 2) Tech Stack & Why

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 15 App Router, RSC, TypeScript, Tailwind | Server-render the dashboard with no client fetch round-trip; server actions for mutations |
| UI | shadcn/ui (Radix + Tailwind) | Accessible primitives, no heavy component dependency |
| Auth | Supabase Auth via `@supabase/ssr` | Cookie-based sessions, middleware refresh, email/password + optional Google OAuth |
| Data | Supabase Postgres + RLS | One source of truth, owner-only RLS on every user table |
| Scheduling | pg_cron + pg_net → Edge Function | Built-in cron; no extra worker/queue infra |
| Push | Web Push (VAPID) + `web-push` in Deno Edge Function | Native browser push, no third-party push vendor, no email |
| Deploy | Vercel (app) + Supabase Cloud (data/functions) | Managed, minimal ops |

Canonical storage is **ml**; oz is a render-time conversion only (1 oz = 29.5735 ml). Timezone is an **IANA string** per user; all date math is DST-correct in SQL, never offset math in JS.

---

## 3) System Architecture (prose summary)

Four layers:

- **Client (browser PWA):** Next.js client components + a single `sw.js` service worker handling `push` and `notificationclick`. Installable via web manifest (`start_url: /dashboard`, standalone).
- **Edge (Vercel):** Next.js middleware (session refresh + route guard), RSC server (reads), and server actions / route handlers (writes). All use the user's JWT, so RLS scopes every row.
- **Supabase:** Auth (GoTrue), Postgres (RLS, per-user timezone), pg_cron (every-minute job), and the `send-reminders` Edge Function (Deno, service-role).
- **External:** browser push services (FCM/Mozilla/Apple), optional Google OAuth.

**Read path:** middleware refreshes the session → RSC queries Postgres directly under RLS → streams the dashboard HTML/RSC (first paint needs no client data fetch).

**Write path:** client calls a server action → action re-checks `getUser()` → insert/upsert under RLS → `revalidatePath` re-renders the affected RSC.

**Reminder path:** pg_cron fires every minute → `pg_net.http_post` invokes the Edge Function → the function calls an atomic Postgres RPC that evaluates each enabled user's rules **in their stored timezone** and claims due users → sends VAPID-signed Web Push to each device → push service delivers to the service worker → SW shows the notification and focuses/opens `/dashboard` on tap.

**Key boundary:** the browser/SSR path only ever uses the anon/user key and is fully constrained by RLS. The reminder function is the only service-role caller; that key is server-only and never in the client bundle.

> The reminder function lives in the **Supabase** layer (Deno), not Vercel edge. Vercel only runs the Next.js app.

---

## 4) Data Model

Four tables — the leanest set that covers v1. Every instant column is `timestamptz` stored in UTC; only schedule fields (`times`, `window_*`, `quiet_*`) are tz-naive local `time` interpreted against the user's timezone.

### Tables & key columns

**`profiles`** — 1:1 with `auth.users`, auto-created by signup trigger.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | = `auth.uid()`, FK → `auth.users(id)` ON DELETE CASCADE |
| `display_name` | text | nullable, app cap ≤ 60 |
| `units` | text | NOT NULL DEFAULT `'ml'`, CHECK in (`ml`,`oz`); display-only |
| `daily_goal_ml` | int | NOT NULL DEFAULT 2000, CHECK 250–20000 |
| `timezone` | text | NOT NULL DEFAULT `'UTC'`, IANA; set from browser at onboarding |
| `created_at`/`updated_at` | timestamptz | `updated_at` via `set_updated_at` trigger |

**`intake_entries`** — append-only drink log; source of truth for totals/history/streak.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` CASCADE |
| `amount_ml` | int | NOT NULL, CHECK 1–5000 (rejects fat-finger) |
| `logged_at` | timestamptz | DEFAULT `now()`; **this** column is bucketed by local day. CHECK `logged_at <= now() + interval '5 minutes'` (reject future, allow backdating) |
| `source` | text | DEFAULT `'quick_add'`, CHECK in (`quick_add`,`custom`,`manual`) |
| `created_at` | timestamptz | audit insert time, distinct from `logged_at` |

Index: `idx_intake_user_logged (user_id, logged_at DESC)`.

**`reminder_settings`** — 1:1, read every minute by the service-role function.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid PK | FK → `profiles(id)` CASCADE |
| `enabled` | boolean | NOT NULL DEFAULT `false` (opt-in after push permission) |
| `mode` | text | DEFAULT `'interval'`, CHECK in (`interval`,`times`) |
| `interval_minutes` | int | **DEFAULT 60**, CHECK 15–1440 |
| `times` | time[] | local wall-clock times for `times` mode |
| `window_start`/`window_end` | time | DEFAULT 08:00 / 22:00; **applies to interval mode only** |
| `quiet_start`/`quiet_end` | time | nullable pair |
| `timezone` | text | **see timezone single-source decision below** |
| `last_sent_at` | timestamptz | written by the function; dedupe key |
| `created_at`/`updated_at` | timestamptz | `updated_at` trigger |

Constraints (fold-in fixes):
- Mode-consistency: `(mode='interval' AND interval_minutes IS NOT NULL) OR (mode='times' AND array_length(times,1) > 0)`.
- `CHECK ((quiet_start IS NULL) = (quiet_end IS NULL))` — quiet hours set as a pair.
- `CHECK (window_start <> window_end)`.
- Partial index `idx_reminder_enabled (enabled) WHERE enabled = true` so the per-minute scan touches only active users.

**`push_subscriptions`** — 1:N (multiple devices).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` CASCADE |
| `endpoint` | text | NOT NULL **UNIQUE** |
| `p256dh` / `auth` | text | NOT NULL, encryption keys |
| `user_agent` | text | nullable, for device list |
| `created_at` | timestamptz | |

Indexes: `UNIQUE(endpoint)`, `idx_push_user (user_id)`.

### RLS rule (all four tables)

Enable RLS; **default-deny**; explicit per-operation policies scoped **`TO authenticated`** (not `public`, for clarity/defense-in-depth):

- `profiles`: key on `auth.uid() = id` for SELECT/INSERT/UPDATE. **No client DELETE policy** (see fix).
- `intake_entries`, `reminder_settings`, `push_subscriptions`: key on `auth.uid() = user_id`. `reminder_settings` also has **no client DELETE policy**.

The service-role Edge Function bypasses RLS to read enabled rows + their subscriptions, stamp `last_sent_at`, and prune dead endpoints.

**Fold-in fixes (data review):**
- **Signup no longer breaks:** the auto-provisioning trigger inserts a self-consistent `reminder_settings` row — `interval_minutes` DEFAULT 60 and `timezone` DEFAULT `'UTC'` (or explicit values in the trigger) so the mode-consistency CHECK and NOT NULL both pass.
- **No client DELETE on `profiles`/`reminder_settings`:** deleting a profile would orphan the auth user; deleting settings would break the 1:1 invariant with no path to recreate. Account deletion is done by deleting the `auth.users` row via the service-role admin API (cascades to all children). "Reset reminders to defaults" is an UPDATE, and settings are loaded with **UPSERT** so a missing row self-heals.
- **Re-subscribe footgun:** because `endpoint` is globally unique but RLS is owner-only, a plain client `ON CONFLICT` is blocked when an endpoint was previously owned by another user. Subscribe goes through a `SECURITY DEFINER` RPC (or service-role path) that does `DELETE FROM push_subscriptions WHERE endpoint=:e` then INSERT with the new `user_id`. Client policies stay owner-only.

### Daily totals & timezone approach

Convert each UTC instant to the user's local day and bucket by it. **Standardize on the sargable variant** (the non-sargable `AT TIME ZONE ... ::date = ...` form is dropped — it can't use the index):

- **Today's total:** compute local-day start and +1 day **in the app**, convert to UTC, then
  `... WHERE user_id = auth.uid() AND logged_at >= :start_utc AND logged_at < :end_utc` → range-scans `idx_intake_user_logged`.
- **History (7/30 days):** bound `logged_at >= :window_start_utc` (UTC), then `GROUP BY (logged_at AT TIME ZONE :tz)::date`. The `AT TIME ZONE` expression is used only for grouping over an already-bounded range; it is DST-correct.
- **Streak:** count consecutive local days ending today/yesterday whose daily sum ≥ `daily_goal_ml`, computed app-side from the grouped result (a SQL view is "later").

---

## 5) Auth

Cookie-based Supabase Auth via `@supabase/ssr`, email/password + optional Google OAuth.

**Flow:**
1. **Sign-up** (server action) → zod-validate → `auth.signUp({ emailRedirectTo: /auth/confirm })` → unconfirmed `auth.users` row → "check your email" screen.
2. **Profile auto-create** — `AFTER INSERT ON auth.users` trigger `handle_new_user()` (`SECURITY DEFINER`, pinned `search_path`) inserts the `profiles` row (tz `'UTC'` until onboarding) **and** the default `reminder_settings` row (enabled=false, interval 60, tz `'UTC'`). Atomic with signup.
3. **Email confirm** — link to `/auth/confirm?token_hash=…&type=email` → `verifyOtp` (server route) writes session cookies → redirect `/dashboard`. (Use `token_hash`+`verifyOtp`, not the legacy `#access_token` fragment.)
4. **Sign-in** (server action) → `signInWithPassword` → cookies set → `revalidatePath('/', 'layout')` → redirect.
5. **OAuth (optional)** — `signInWithOAuth({ provider:'google', redirectTo:/auth/callback })` → `exchangeCodeForSession` (PKCE).
6. **Middleware refresh** — every non-static request calls `updateSession()`: create server client, **immediately** `getUser()` (no code in between), guard protected routes, return the **same** response object carrying rotated cookies.

**Authorization discipline (never cut):**
- Always `getUser()` server-side for authZ — **never** `getSession()` (it only decodes cookies and can be spoofed). `getSession`/`onAuthStateChange` are client UI-state only.
- Cookies adapter uses `getAll`/`setAll`; wrap `setAll` in try/catch for RSC render context.
- Layouts do **not** protect route handlers/server actions — every mutating action re-calls `getUser()`.
- The app path never uses the service-role key; RLS is always enforced.
- Construct the server client per-request (bound to that request's cookies); never hoist to module scope.
- Add every `emailRedirectTo`/`redirectTo` (Site URL, localhost, Vercel preview + prod) to Supabase Auth redirect allow-list.

**Timezone capture:** the trigger defaults tz to `'UTC'`; onboarding/login captures the real IANA zone via `Intl.DateTimeFormat().resolvedOptions().timeZone` and writes it to `profiles.timezone`; Settings lets the user override.

---

## 6) Reminder & Web-Push System

### Pipeline (per-minute delivery)

1. **pg_cron** fires `send-water-reminders` on `* * * * *`.
2. **pg_net** does an async `http_post` to the Edge Function URL with a Vault-stored `cron_secret` in the `Authorization` header. Use **`timeout_milliseconds := 15000–30000`** (a 5 s timeout can be shorter than a cold start and would sever a claimed-but-unsent run).
3. **Edge Function** (deployed `verify_jwt=false`) validates the shared secret with a **constant-time compare** (`crypto.timingSafeEqual`); 401 on mismatch.
4. Function calls the `SECURITY DEFINER` RPC `claim_due_reminders()` (service-role, pinned `search_path`).
5–7. **Claim logic** (the corrected core):
   - Single statement over the partial-enabled set using **`FOR UPDATE SKIP LOCKED`** so two overlapping runs can never double-claim.
   - Compute local wall-clock with `now() AT TIME ZONE timezone` (DST-correct).
   - **Timezone single-source:** evaluate against `profiles.timezone` directly (JOIN `profiles` on the PK over the already-small enabled set) — **do not** rely on a hand-synced snapshot column. (If you keep the snapshot, propagate it with an `AFTER UPDATE OF timezone ON profiles` trigger; the join is preferred for v1.)
   - **Interval mode:** due when `last_sent_at IS NULL OR now() - last_sent_at >= make_interval(mins => interval_minutes)` — the **NULL guard is essential**, otherwise a brand-new user's first reminder never fires. Apply the **active window** (interval mode only) and **quiet hours** as half-open, wrap-aware exclusions. Anchor to a fixed grid from `window_start` (compare current grid slot to the slot of `last_sent_at`) to prevent forward drift past `window_end`.
   - **Fixed (`times`) mode:** **catch-up on the day, not the minute** — fire if any `times[]` slot's local time today is `<= now()` and `> last_sent_at`'s local time, deduped on `(local_date, slot)`. This survives a missed tick, pg_net stall, cold start, or deploy, and is DST-safe (fall-back fires once, spring-forward fires at the next valid minute). Fixed times **bypass the active window** (the user named the exact time); validate fixed times against quiet hours at save time and warn rather than silently suppressing.
   - **Quiet-hours NULL gate:** `AND NOT (quiet_start IS NOT NULL AND quiet_end IS NOT NULL AND <wrap-aware test>)`.
8. Claimed users with zero subscriptions → no-op (surface a "this device isn't subscribed" banner in UI).
9. Build a compact, PII-free payload `{ title, body, url:'/dashboard', tag:'hydrate-reminder' }` well under ~3 KB.
10. Sign each push with VAPID (`web-push`, keys from Edge secrets), bounded concurrency via `Promise.allSettled`.
11–12. Per-endpoint status: **201** = success; **404/410** → DELETE the dead row; **429/5xx/network/VAPID-400** → leave for retry.
13–16. Push service → SW `push` event → `showNotification(...)` inside `waitUntil` with **`renotify:true`** (so a second reminder re-alerts instead of silently coalescing) → on tap, `notificationclick` focuses an existing client or `openWindow('/dashboard?src=reminder')`.

### Dedupe & no-missed-sends (the critical fix)

**Decouple "claim" from "sent."** `last_sent_at` is **not** stamped before the push. Either:
- **(A, preferred)** claim with an in-flight marker (`claimed_at` + `FOR UPDATE SKIP LOCKED`), send, then `UPDATE last_sent_at` **only** for users with ≥1 device returning 201; or
- **(B)** optimistically stamp but capture the prior `last_sent_at` in `RETURNING` and **roll it back** for users whose every device returned 429/5xx/network error.

Either way, transient failures and function crashes retry next minute instead of silently dropping a reminder. Interval dedupe is `last_sent_at`; fixed dedupe is `(user, local_date, slot)`.

### Subscription lifecycle

- **Subscribe (user gesture):** toggle → `Notification.requestPermission()` (abort with explainer if not granted) → register `/sw.js`, await `ready` → `pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: VAPID_PUBLIC })` → POST `sub.toJSON()` to the subscribe RPC (owner-scoped, idempotent on endpoint).
- **Refresh:** SW handles `pushsubscriptionchange` (re-subscribe + re-upsert); defense-in-depth, on each app load compare `getSubscription()` to the server and re-upsert if the endpoint changed.
- **Expiry/410 cleanup (authoritative):** server deletes rows on 404/410 — the only way to prune an uninstalled PWA that never runs JS again.
- **User unsubscribe:** `sub.unsubscribe()` client-side **and** delete the row server-side. Disabling reminders sets `enabled=false`.
- **Auto-disable:** flip `enabled=false` after N days of zero subscriptions so the cron stops evaluating dead users.

**Secrets:** one app-wide VAPID keypair; `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (valid `mailto:`/https, validated at deploy) live **only** as Edge secrets; public key is `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Cron secret in Vault. Rotating VAPID invalidates all subscriptions — treat as long-lived.

---

## 7) Screens & UX

Mobile-first AppShell: bottom tab bar (Dashboard / History / Reminders / Settings) on small screens, left sidebar on md+. Optional dark mode (next-themes), hydration blue/cyan theme.

| Screen | Route | Purpose | Key data |
|--------|-------|---------|----------|
| Landing | `/` | One-line value prop + CTA; authed users redirect to `/dashboard` | static |
| Auth | `/sign-in` (Tab → `/sign-up`) | Email/password + optional Google; inline validation | Supabase Auth only |
| Onboarding | `/onboarding` | Goal, units, auto-detected timezone, enable reminders (gesture-gated push subscribe); marks onboarded | writes `profiles`, `reminder_settings`, `push_subscriptions` |
| Dashboard | `/dashboard` | PWA `start_url`; radial progress ring + remaining, quick-add (250/500/750 + custom), recent entries with undo, streak badge | reads `profiles` + today's `intake_entries`; inserts/deletes entries |
| History | `/history` | 7/30-day bar chart + goal line, streak, total, average, goal-hit days | read-only aggregates |
| Reminders | `/reminders` | Mode (interval/fixed), interval, fixed-time list, active window, quiet hours, enable, "send test", device push status | reads/writes `reminder_settings`, reads `push_subscriptions` |
| Settings | `/settings` | Display name, email (read-only), units, goal, timezone, manage push devices, sign out | reads/writes `profiles`, lists/removes `push_subscriptions` |

**PWA:** `manifest.ts` (standalone, `start_url:/dashboard`, icons 192/512 + maskable, blue theme). Capture `beforeinstallprompt` for an Install button (Onboarding + Settings); iOS shows inline "Share → Add to Home Screen". Single `sw.js` (push + notificationclick + subscription lifecycle only — no aggressive caching). Offline-light v1: precache app shell, serve cached read-only last dashboard with an offline banner; quick-add disabled offline (write queue is "later").

**Non-negotiables:**
- **Units:** store ml everywhere; convert oz only at display/input edges from `profiles.units`.
- **Timezone:** all bucketing/streak/window/quiet logic in `profiles.timezone`.
- **Validation:** amount 1–5000 ml, goal 250–20000 ml, interval 15–1440 min, well-formed time fields — enforced both client (Zod + react-hook-form via shadcn Form) and server (RLS + CHECK).
- **A11y:** every input labeled; ring exposes `aria-valuenow/min/max` + "X of Y ml" text fallback; toasts `aria-live`; honor `prefers-reduced-motion` on ring fill; full keyboard path; visible focus; AA contrast.
- **Radial ring:** tiny custom SVG (`stroke-dasharray`), no new dependency; shadcn `Progress` for linear bars.

shadcn set: button card badge tabs form input label select slider switch progress dialog drawer table alert-dialog avatar separator sonner chart.

---

## 8) Build Roadmap

| ID | Milestone | Goal | Key acceptance criteria |
|----|-----------|------|--------------------------|
| **M0** | Scaffold & local dev | Next.js 15 + Tailwind + shadcn wired to local Supabase, quality gates green | `build`, `typecheck` (tsc --noEmit), `lint` exit 0; `supabase status` shows API/DB/Auth up; shadcn Button renders (HTTP 200 on `/`) |
| **M1** | Auth, profiles & RLS baseline | Cookie auth via `@supabase/ssr` + middleware refresh; `profiles` with tz/units; RLS on all tables | Unauth GET of protected route 302→`/sign-in`; session survives reload; user B reads 0 rows of user A's profile; signup auto-creates exactly one profile **and one valid `reminder_settings` row** (CHECK passes); zod rejects bad email/short password pre-network |
| **M2** | Water logging & dashboard | Quick-add + custom with server validation; live ring in user's tz | Quick-add updates ring optimistically + reconciles; daily total = SQL sum in user's tz (tested near a tz boundary, **UTC-bounds query**); action rejects ≤0 or >5000 (no row); user B can't read/delete user A's entries; remaining = max(goal−consumed, 0) |
| **M3** | History & stats | 7/30-day views + streak, tz-correct, delete entry | Per-day buckets correct across a **DST + midnight** fixture; streak resets/counts correctly (unit tests); 7d/30d return correct bucket counts; delete updates total + ring; stats RLS-scoped |
| **M4** | Reminder configuration | Interval/fixed, window, quiet hours, enable; settings persist | Settings persist + reload identically; RLS blocks cross-user; validation rejects `window_start = window_end`, empty `times[]` in fixed mode, half-set quiet pair; disabling sets `enabled=false` |
| **M5** | PWA & push subscription | Installable PWA + SW; gesture-gated subscribe stored per device | Lighthouse installable passes; SW registers; Enable writes exactly one subscription (endpoint+keys) via the subscribe RPC; permission never requested without gesture; denied state is non-nagging; local test push shows a notification |
| **M6** | Scheduled push delivery | pg_cron → Edge Function finds due users (tz/window/quiet/enabled), sends VAPID push, prunes dead subs | Seeded due user receives a real push; quiet-hours / `enabled=false` user gets nothing; **new user's first interval reminder fires (NULL `last_sent_at`)**; 410 sub deleted; **`last_sent_at` only advances on send-success**; two overlapping invocations send exactly once (`FOR UPDATE SKIP LOCKED`); fixed-mode catch-up fires once after a skipped minute; cron job present in `cron.job` and visible in logs |
| **M7** | Accessibility & polish | A11y, responsive, ml/oz consistency, loading/empty/error states | axe/Lighthouse: no critical violations on dashboard/history/settings; full log→stats→settings flow keyboard-only; unit switch updates all amounts; each route has defined loading + empty states; `prefers-reduced-motion` disables ring animation |
| **M8** | Production deploy | Live on Vercel + Supabase Cloud; migrations, secrets, cron, real-device smoke | Prod URL 200 + login works; logged amount persists + appears in history on prod DB; cron scheduled + function logs show invocations; real push received on installed iOS PWA **and** Android Chrome; advisors report no RLS-disabled user tables |

Dependencies: M0→M1→{M2→M3, M2→M4}; M5 needs M1+M4; M6 needs M5; M7 needs M2–M5; M8 needs M6+M7.

---

## 9) Testing

Layered and lazy, matching the stack:

1. **Static gates (every change):** `tsc --noEmit`, ESLint, Prettier.
2. **Unit (Vitest)** for bug-prone pure logic with no infra: tz day-bucketing, streak, `computeDue`/`claim` predicate logic (interval + fixed, window + quiet, **DST fall-back duplicate and spring-forward gap** fixtures, NULL `last_sent_at`), ml↔oz conversion.
3. **RLS/security (pgTAP or set-role/JWT sessions):** user B cannot select/insert/update/delete user A's `profiles`, `intake_entries`, `reminder_settings`, `push_subscriptions`.
4. **Integration** for server actions (validation bounds, auth required, correct daily totals via UTC-bounds query) against the local Supabase stack.
5. **One Playwright E2E happy path:** signup → log water → ring updates → 7-day stats → save reminder settings.
6. **Push pipeline** via `supabase functions serve` against a seeded due user + captured test subscription: asserts delivery, quiet-hour suppression, 410-pruning, send-success stamping, exactly-once under overlapping invocations.
7. **Lighthouse** for PWA installability + a11y (no critical axe violations).
8. **Manual real-device smoke** for push on an installed iOS PWA and Android Chrome (emulators don't faithfully cover Web Push).

No broad Supabase mocking — the local stack is the source of truth.

---

## 10) Deployment

1. **Supabase Cloud:** `supabase link`; `supabase db push` all migrations; confirm RLS enabled on all four tables via advisors / `db lint`.
2. **VAPID:** generate keypair; private key + subject → Edge secrets only; public key → frontend env.
3. **Edge Function:** `supabase functions deploy send-reminders`; set `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (validated `mailto:`), `CRON_SECRET`; deploy with `verify_jwt=false`.
4. **Cron:** enable `pg_cron` + `pg_net`; store `project_url` + `cron_secret` in Vault; schedule `* * * * *` `net.http_post` to `/functions/v1/send-reminders` with `timeout_milliseconds := 15000`; verify it lands in `cron.job`. Ops: inspect `cron.job_run_details` and `net._http_response` for failures.
5. **Vercel:** set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Production + Preview); never expose service-role or VAPID private key.
6. **Auth URLs:** set Site URL + redirect URLs (localhost, Vercel preview + prod, Google OAuth redirect in both Supabase and Google Cloud).
7. **Smoke test:** signup → log water → configure a reminder a couple minutes out → confirm a real push on installed iOS PWA + Android Chrome.
8. **Ops note:** Supabase free-tier auto-pause halts the every-minute cron — keep the project active or accept paused-state gaps (paid upgrade is "later").

---

## 11) Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **iOS Web Push only works in an installed PWA** (16.4+, standalone, gesture-gated, no install prompt) | Detect iOS + non-standalone, show "Add to Home Screen" instructions; push is best-effort, never blocks logging |
| **Timezone/DST correctness** (buckets, streaks, window, quiet, due-checks) | Store UTC `timestamptz`; compute all day/window math `AT TIME ZONE profiles.timezone`; single-source tz via JOIN; DST + midnight unit fixtures |
| **pg_cron minute granularity + overlapping runs** | Grid-anchored interval, fixed-mode day-catch-up, `FOR UPDATE SKIP LOCKED` atomic claim, stamp `last_sent_at` only on send-success |
| **Missed sends** (NULL `last_sent_at`, transient 429/5xx, crashes, fixed single-minute window) | NULL-as-due predicate; decoupled claim-vs-sent with rollback/marker; fixed-mode catch-up — all covered above |
| **Push permission UX** (gesture-only, sticky denial, over-prompting → uninstalls) | Gate behind explicit Enable button; persist denied state and guide to site settings; in-app progress as graceful fallback |
| **Supabase free-tier limits / auto-pause** | Keep cron function lean; monitor invocations; document that auto-pause stops reminders |
| **VAPID/web-push under Deno** (bad signing → 401) | Validate signing against a real endpoint early in M6; pin a Deno-compatible approach; validate `VAPID_SUBJECT` at deploy |
| **Service-worker caching staleness** | Version the SW; deliberate `skipWaiting`/`clients.claim`; keep SW minimal (push + click only) |
| **Cross-user data exposure** | RLS enabled at table creation, `TO authenticated`, default-deny, as-another-user SQL denial tests, advisors before deploy |

---

## 12) Out of Scope / Later

- Google OAuth polish (optional in v1; ship if config is cheap).
- Supabase Realtime for cross-device live ring sync.
- Offline write queue / Background Sync; richer offline.
- Account self-deletion UI (admin-API cascade exists; expose later).
- `pgmq`/queue + worker fan-out if a single per-minute run exceeds ~60 s; Retry-After-aware backoff beyond next-minute retry.
- Per-send delivery analytics / `notifications_log` (v1 relies on `last_sent_at`).
- Localized notification copy; multi-device subscription management UI.
- Folding `reminder_settings` into `profiles` (fewer tables) once the join-based tz fix makes the split optional.
- SQL view for streaks; richer marketing site; multi-beverage; gamification/social.
- **No email channel, ever** (per stack).