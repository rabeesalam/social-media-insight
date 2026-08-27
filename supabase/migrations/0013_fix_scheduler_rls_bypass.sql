-- 0013_fix_scheduler_rls_bypass.sql
-- Real bug found via live testing: enqueue_due_sync_jobs() was never SECURITY DEFINER, so when
-- pg_cron invokes it, it runs under RLS as whatever role pg_cron executes as -- not a Supabase
-- Auth `authenticated` session. platform_connections' select policy requires
-- auth.role() = 'authenticated' (0005_rls_policies.sql), which is NULL/false outside of a real
-- PostgREST-mediated request, so the join silently returned zero rows every single run. No error
-- was ever raised -- "0 jobs created" looked like normal (if uninteresting) behavior instead of a
-- symptom, which is exactly why this went unnoticed until there was finally real content to sync.

alter function enqueue_due_sync_jobs() security definer;
alter function enqueue_due_sync_jobs() set search_path = public;

-- Backfill: create jobs for all currently-eligible content right now rather than waiting up to
-- 15 minutes for the next cron tick.
select enqueue_due_sync_jobs();
