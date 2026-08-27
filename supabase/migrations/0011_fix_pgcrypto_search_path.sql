-- 0011_fix_pgcrypto_search_path.sql
-- Real bug found via a live register_device call: pgcrypto lives in Supabase's `extensions`
-- schema, not `public` (confirmed: select extnamespace::regnamespace from pg_extension where
-- extname='pgcrypto' -> extensions). verify_device/register_device are SECURITY DEFINER with
-- `set search_path = public` (correct hardening against search_path-injection attacks in
-- general), but that same restriction meant digest()/gen_random_bytes() couldn't resolve, so
-- every register_device call failed with `function gen_random_bytes(integer) does not exist`.
-- Fix: explicitly add `extensions` to search_path for just the two functions that call pgcrypto
-- — do not widen this to every SECURITY DEFINER function, and do not move pgcrypto into `public`
-- (fighting Supabase's own convention would just break the next `supabase db pull`).

alter function verify_device(uuid, text) set search_path = public, extensions;
alter function register_device(uuid, text, text, integer, text, text) set search_path = public, extensions;
