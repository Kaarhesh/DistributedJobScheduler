/*
# Update RLS Policies to Require Authentication

## Overview
This migration updates all RLS policies on all tables to require authentication.
Previously, policies allowed `anon, authenticated` access (single-tenant, no auth).
Now that the app has a sign-in screen, all access requires an authenticated session.

## Changes
- All 10 tables have their policies updated from `TO anon, authenticated` to `TO authenticated`
- The `USING (true)` / `WITH CHECK (true)` predicates are kept because the data is
  intentionally shared among all authenticated users (it's a shared scheduler, not
  per-user isolated data)
- No new tables or columns are added
- No data is modified or deleted

## Security
- Unauthenticated (anon) users can no longer read or write any data
- Only authenticated users can perform CRUD operations
- The edge functions use the service role key which bypasses RLS, so they are unaffected

## Tables Updated (10)
1. queues
2. retry_policies
3. workers
4. jobs
5. job_executions
6. job_logs
7. worker_heartbeats
8. scheduled_jobs
9. dead_letter_queue
10. queue_stats
*/

-- ============================================================================
-- queues
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_queues" ON queues;
CREATE POLICY "auth_select_queues" ON queues FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_queues" ON queues;
CREATE POLICY "auth_insert_queues" ON queues FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_queues" ON queues;
CREATE POLICY "auth_update_queues" ON queues FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_queues" ON queues;
CREATE POLICY "auth_delete_queues" ON queues FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- retry_policies
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_retry_policies" ON retry_policies;
CREATE POLICY "auth_select_retry_policies" ON retry_policies FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_retry_policies" ON retry_policies;
CREATE POLICY "auth_insert_retry_policies" ON retry_policies FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_retry_policies" ON retry_policies;
CREATE POLICY "auth_update_retry_policies" ON retry_policies FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_retry_policies" ON retry_policies;
CREATE POLICY "auth_delete_retry_policies" ON retry_policies FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- workers
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_workers" ON workers;
CREATE POLICY "auth_select_workers" ON workers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_workers" ON workers;
CREATE POLICY "auth_insert_workers" ON workers FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_workers" ON workers;
CREATE POLICY "auth_update_workers" ON workers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_workers" ON workers;
CREATE POLICY "auth_delete_workers" ON workers FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- jobs
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_jobs" ON jobs;
CREATE POLICY "auth_select_jobs" ON jobs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_jobs" ON jobs;
CREATE POLICY "auth_insert_jobs" ON jobs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_jobs" ON jobs;
CREATE POLICY "auth_update_jobs" ON jobs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_jobs" ON jobs;
CREATE POLICY "auth_delete_jobs" ON jobs FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- job_executions
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_job_executions" ON job_executions;
CREATE POLICY "auth_select_job_executions" ON job_executions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_job_executions" ON job_executions;
CREATE POLICY "auth_insert_job_executions" ON job_executions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_job_executions" ON job_executions;
CREATE POLICY "auth_update_job_executions" ON job_executions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_job_executions" ON job_executions;
CREATE POLICY "auth_delete_job_executions" ON job_executions FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- job_logs
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_job_logs" ON job_logs;
CREATE POLICY "auth_select_job_logs" ON job_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_job_logs" ON job_logs;
CREATE POLICY "auth_insert_job_logs" ON job_logs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_job_logs" ON job_logs;
CREATE POLICY "auth_update_job_logs" ON job_logs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_job_logs" ON job_logs;
CREATE POLICY "auth_delete_job_logs" ON job_logs FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- worker_heartbeats
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_worker_heartbeats" ON worker_heartbeats;
CREATE POLICY "auth_select_worker_heartbeats" ON worker_heartbeats FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_worker_heartbeats" ON worker_heartbeats;
CREATE POLICY "auth_insert_worker_heartbeats" ON worker_heartbeats FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_worker_heartbeats" ON worker_heartbeats;
CREATE POLICY "auth_update_worker_heartbeats" ON worker_heartbeats FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_worker_heartbeats" ON worker_heartbeats;
CREATE POLICY "auth_delete_worker_heartbeats" ON worker_heartbeats FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- scheduled_jobs
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "auth_select_scheduled_jobs" ON scheduled_jobs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "auth_insert_scheduled_jobs" ON scheduled_jobs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "auth_update_scheduled_jobs" ON scheduled_jobs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "auth_delete_scheduled_jobs" ON scheduled_jobs FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- dead_letter_queue
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_dlq" ON dead_letter_queue;
CREATE POLICY "auth_select_dlq" ON dead_letter_queue FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dlq" ON dead_letter_queue;
CREATE POLICY "auth_insert_dlq" ON dead_letter_queue FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dlq" ON dead_letter_queue;
CREATE POLICY "auth_update_dlq" ON dead_letter_queue FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dlq" ON dead_letter_queue;
CREATE POLICY "auth_delete_dlq" ON dead_letter_queue FOR DELETE
  TO authenticated USING (true);

-- ============================================================================
-- queue_stats
-- ============================================================================
DROP POLICY IF EXISTS "anon_select_queue_stats" ON queue_stats;
CREATE POLICY "auth_select_queue_stats" ON queue_stats FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_queue_stats" ON queue_stats;
CREATE POLICY "auth_insert_queue_stats" ON queue_stats FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_queue_stats" ON queue_stats;
CREATE POLICY "auth_update_queue_stats" ON queue_stats FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_queue_stats" ON queue_stats;
CREATE POLICY "auth_delete_queue_stats" ON queue_stats FOR DELETE
  TO authenticated USING (true);
