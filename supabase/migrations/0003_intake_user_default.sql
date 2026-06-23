-- 0003 — Default intake_entries.user_id to the caller's auth.uid() so clients
-- can insert { amount_ml, source } without threading the id. RLS still enforces
-- user_id = auth.uid(), so this is convenience, not a hole (and prevents spoofing
-- a different owner: a wrong user_id fails the policy).
alter table public.intake_entries alter column user_id set default auth.uid();
