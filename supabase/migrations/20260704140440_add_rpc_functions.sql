/*
# Add claim_jobs and requeue_from_dlq RPC functions

## Overview
Adds two stored procedures used by the worker edge function and the DLQ UI:

1. **claim_jobs** — Atomic job claiming using SELECT FOR UPDATE SKIP LOCKED.
   Called by the worker-tick edge function. Claims up to N queued jobs from a
   queue for a given worker, setting status='claimed' and recording worker_id
   and claimed_at. This is the race-free claim mechanism.

2. **requeue_from_dlq** — Moves a job from the dead letter queue back to its
   queue. Resets attempts to 0, clears the error, sets status='queued', and
   deletes the DLQ entry. Called from the dashboard's Dead Letter page.

## Security
- Both functions are SECURITY DEFINER so they can run with elevated privileges
  (the edge function uses the service role key, but the frontend uses anon).
- VOLATILE because they modify data and use SKIP LOCKED.
*/

-- ============================================================================
-- claim_jobs: atomic job claiming with SKIP LOCKED
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_jobs(p_queue_id UUID, p_worker_id UUID, p_limit INTEGER DEFAULT 1)
RETURNS TABLE (
  id UUID,
  queue_id UUID,
  type TEXT,
  status TEXT,
  priority INTEGER,
  payload JSONB,
  attempts INTEGER,
  worker_id UUID
) AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Atomically claim up to p_limit queued jobs using FOR UPDATE SKIP LOCKED.
  -- This is the race-free claim mechanism: multiple workers can call this
  -- concurrently and each gets a disjoint set of jobs.
  UPDATE jobs
  SET
    status = 'claimed',
    worker_id = p_worker_id,
    claimed_at = v_now
  WHERE id IN (
    SELECT id FROM jobs
    WHERE queue_id = p_queue_id
      AND status = 'queued'
      AND run_at <= v_now
    ORDER BY priority DESC, run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, queue_id, type, status, priority, payload, attempts, worker_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ============================================================================
-- requeue_from_dlq: move a job from DLQ back to its queue
-- ============================================================================
CREATE OR REPLACE FUNCTION requeue_from_dlq(p_dlq_id UUID)
RETURNS VOID AS $$
DECLARE
  v_job_id UUID;
  v_queue_id UUID;
  v_payload JSONB;
BEGIN
  SELECT job_id, queue_id, payload INTO v_job_id, v_queue_id, v_payload
  FROM dead_letter_queue
  WHERE id = p_dlq_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'DLQ entry not found';
  END IF;

  -- Reset the job to queued state
  UPDATE jobs
  SET
    status = 'queued',
    attempts = 0,
    error = NULL,
    result = NULL,
    worker_id = NULL,
    claimed_at = NULL,
    started_at = NULL,
    finished_at = NULL,
    run_at = now()
  WHERE id = v_job_id;

  -- Remove from DLQ
  DELETE FROM dead_letter_queue WHERE id = p_dlq_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
