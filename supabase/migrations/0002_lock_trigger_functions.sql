-- 0002 — Trigger functions must never be callable directly via PostgREST RPC.
-- They run inside triggers (as the table owner), so no role needs EXECUTE.
-- Revoking it removes them from the exposed API surface (clears the
-- anon/authenticated SECURITY DEFINER advisor warnings).

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.bump_reminder_token() from public, anon, authenticated;
