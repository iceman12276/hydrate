-- 0001_init — Hydrate schema: profiles, intake_entries, reminder_settings.
-- Canonical unit is milliliters. One IANA timezone per user. Owner-only RLS on
-- every table. No push_subscriptions, no service-role reminder path (reminders
-- are on-device). See PLAN.md §5–§7.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  daily_goal_ml integer not null default 2000 check (daily_goal_ml between 250 and 20000),
  units text not null default 'ml' check (units in ('ml', 'oz')),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.intake_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_ml integer not null check (amount_ml between 1 and 5000),
  logged_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('quick_add', 'custom', 'manual')),
  created_at timestamptz not null default now()
);

-- Index-friendly range scan for daily totals / history (PLAN.md §5).
create index idx_intake_user_logged on public.intake_entries (user_id, logged_at);

create table public.reminder_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'interval' check (mode in ('interval', 'times')),
  interval_minutes integer not null default 60 check (interval_minutes between 15 and 1440),
  times time[] not null default '{}',
  window_start time not null default '08:00',
  window_end time not null default '22:00',
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now(),
  constraint window_bounds_differ check (window_start <> window_end),
  constraint quiet_both_or_neither check ((quiet_start is null) = (quiet_end is null)),
  -- The equal-quiet bug: equal bounds make the wrap-aware quiet test always-true
  -- and silently suppress every reminder. Forbid it (PLAN.md §5).
  constraint quiet_bounds_differ check (quiet_start is null or quiet_start <> quiet_end),
  constraint times_present_in_times_mode check (
    mode <> 'times' or coalesce(array_length(times, 1), 0) >= 1
  )
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Maintain updated_at. On reminder_settings this is the load-bearing re-arm
-- sync token every client compares against.
create function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_reminder_settings_updated_at
  before update on public.reminder_settings
  for each row execute function public.set_updated_at();

-- A timezone change bumps the schedule token so every device re-arms.
create function public.bump_reminder_token() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.reminder_settings set updated_at = now() where user_id = new.id;
  return new;
end;
$$;

create trigger trg_profiles_tz_bumps_reminder
  after update of timezone on public.profiles
  for each row
  when (old.timezone is distinct from new.timezone)
  execute function public.bump_reminder_token();

-- On signup, atomically provision a profile and a self-consistent default
-- reminder_settings row so all NOT NULLs / CHECKs pass and signup can't break.
create function public.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.reminder_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security: default-deny + explicit owner-only policies.
-- auth.uid() wrapped in a subselect so the planner evaluates it once
-- (avoids the auth_rls_initplan advisor).
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.intake_entries enable row level security;
alter table public.reminder_settings enable row level security;

-- profiles: owner read + update. Insert is the signup trigger's job; no delete.
create policy profiles_select on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- intake_entries: full owner CRUD; writes bounded to <= now() + 5 min (this rule
-- needs the server clock, so it lives in the policy, not a CHECK constraint).
create policy intake_select on public.intake_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy intake_insert on public.intake_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id and logged_at <= now() + interval '5 minutes');
create policy intake_update on public.intake_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and logged_at <= now() + interval '5 minutes');
create policy intake_delete on public.intake_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

-- reminder_settings: owner read + upsert (self-heal a missing row); no delete
-- (reset-to-defaults is an update).
create policy reminder_select on public.reminder_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy reminder_insert on public.reminder_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy reminder_update on public.reminder_settings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
