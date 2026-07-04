/*
# Create Distributed Job Scheduler Schema

## Overview
Creates the complete schema for a distributed job scheduler system with queues,
jobs, workers, retry policies, scheduling, dead letter queue, and stats rollup.

## New Tables (14 total)

1. **queues** - Work queues with priority, concurrency limit, pause/resume
2. **jobs** - The core hot table; one row per unit of work (the table workers poll)
3. **job_executions** - One row per attempt (retry history / audit trail)
4. **job_logs** - Free-form log lines emitted during execution
5. **workers** - Registry of worker processes
6. **worker_heartbeats** - Time-series of worker health metrics
7. **retry_policies** - 1:1 with queues; retry strategy + limits
8. **scheduled_jobs** - 1:1 with scheduled/delayed/recurring jobs
9. **dead_letter_queue** - Parking lot for jobs that exhausted retries
10. **queue_stats** - Denormalized rollup for dashboard performance

## Key Design Decisions
- Partial claim index on jobs (WHERE status='queued') for fast SKIP LOCKED polling
- Partial index on scheduled_jobs (WHERE is_active) for fast scheduler tick
- Denormalized jobs.attempts count to avoid COUNT(*) on the claim path
- queue_stats rollup so dashboard reads one row per queue, not six aggregates
- Idempotency key unique per queue (partial unique index, NULLs allowed)

## Security
- RLS enabled on ALL tables
- Single-tenant app (no auth): policies use TO anon, authenticated
- All data is intentionally shared/public for the dashboard demo
*/

-- ============================================================================
-- queues
-- ============================================================================
CREATE TABLE IF NOT EXISTS queues (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    description       TEXT,
    priority          INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0),
    concurrency_limit INTEGER NOT NULL DEFAULT 10 CHECK (concurrency_limit > 0),
    is_paused         BOOLEAN NOT NULL DEFAULT false,
    config            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queues_name ON queues (name);
CREATE INDEX IF NOT EXISTS idx_queues_priority ON queues (priority DESC);
CREATE INDEX IF NOT EXISTS idx_queues_active ON queues (id) WHERE is_paused = false;

ALTER TABLE queues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_queues" ON queues;
CREATE POLICY "anon_select_queues" ON queues FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_queues" ON queues;
CREATE POLICY "anon_insert_queues" ON queues FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_queues" ON queues;
CREATE POLICY "anon_update_queues" ON queues FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_queues" ON queues;
CREATE POLICY "anon_delete_queues" ON queues FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- retry_policies (1:1 with queues)
-- ============================================================================
CREATE TABLE IF NOT EXISTS retry_policies (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id       UUID NOT NULL UNIQUE REFERENCES queues(id) ON DELETE CASCADE,
    strategy       TEXT NOT NULL DEFAULT 'exponential'
                   CHECK (strategy IN ('fixed', 'linear', 'exponential')),
    max_attempts   INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 0),
    base_delay_ms  INTEGER NOT NULL DEFAULT 1000 CHECK (base_delay_ms >= 0),
    max_delay_ms   INTEGER NOT NULL DEFAULT 60000 CHECK (max_delay_ms >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (max_delay_ms >= base_delay_ms)
);

ALTER TABLE retry_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_retry_policies" ON retry_policies;
CREATE POLICY "anon_select_retry_policies" ON retry_policies FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_retry_policies" ON retry_policies;
CREATE POLICY "anon_insert_retry_policies" ON retry_policies FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_retry_policies" ON retry_policies;
CREATE POLICY "anon_update_retry_policies" ON retry_policies FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_retry_policies" ON retry_policies;
CREATE POLICY "anon_delete_retry_policies" ON retry_policies FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- workers
-- ============================================================================
CREATE TABLE IF NOT EXISTS workers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    hostname      TEXT NOT NULL DEFAULT 'edge-function',
    concurrency   INTEGER NOT NULL DEFAULT 5 CHECK (concurrency > 0),
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'draining', 'dead')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_status ON workers (status);
CREATE INDEX IF NOT EXISTS idx_workers_last_seen ON workers (last_seen_at);

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workers" ON workers;
CREATE POLICY "anon_select_workers" ON workers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_workers" ON workers;
CREATE POLICY "anon_insert_workers" ON workers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_workers" ON workers;
CREATE POLICY "anon_update_workers" ON workers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_workers" ON workers;
CREATE POLICY "anon_delete_workers" ON workers FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- jobs (the hot table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id        UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    type            TEXT NOT NULL DEFAULT 'immediate'
                    CHECK (type IN ('immediate', 'delayed', 'scheduled', 'recurring', 'batch')),
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'retry', 'dead')),
    priority        INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0),
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    result          JSONB,
    error           TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    worker_id       UUID REFERENCES workers(id) ON DELETE SET NULL,
    run_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at      TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    idempotency_key TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- THE claim index: partial, ordered for SKIP LOCKED polling.
CREATE INDEX IF NOT EXISTS idx_jobs_claim
    ON jobs (queue_id, priority DESC, run_at)
    WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_queue_id ON jobs (queue_id);

-- Idempotency: unique per queue, but only when a key is provided.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency
    ON jobs (queue_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_jobs" ON jobs;
CREATE POLICY "anon_select_jobs" ON jobs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_jobs" ON jobs;
CREATE POLICY "anon_insert_jobs" ON jobs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_jobs" ON jobs;
CREATE POLICY "anon_update_jobs" ON jobs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_jobs" ON jobs;
CREATE POLICY "anon_delete_jobs" ON jobs FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- job_executions (one row per attempt)
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id       UUID REFERENCES workers(id) ON DELETE SET NULL,
    attempt_number  INTEGER NOT NULL CHECK (attempt_number >= 1),
    status          TEXT NOT NULL CHECK (status IN ('success', 'failed', 'running')),
    duration_ms     INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    error           TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    UNIQUE (job_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_executions_job_id ON job_executions (job_id);
CREATE INDEX IF NOT EXISTS idx_executions_worker_started ON job_executions (worker_id, started_at);

ALTER TABLE job_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_job_executions" ON job_executions;
CREATE POLICY "anon_select_job_executions" ON job_executions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_job_executions" ON job_executions;
CREATE POLICY "anon_insert_job_executions" ON job_executions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_job_executions" ON job_executions;
CREATE POLICY "anon_update_job_executions" ON job_executions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_job_executions" ON job_executions;
CREATE POLICY "anon_delete_job_executions" ON job_executions FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- job_logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    level      TEXT NOT NULL DEFAULT 'info'
               CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message    TEXT NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_job_created ON job_logs (job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_level ON job_logs (level);

ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_job_logs" ON job_logs;
CREATE POLICY "anon_select_job_logs" ON job_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_job_logs" ON job_logs;
CREATE POLICY "anon_insert_job_logs" ON job_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_job_logs" ON job_logs;
CREATE POLICY "anon_update_job_logs" ON job_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_job_logs" ON job_logs;
CREATE POLICY "anon_delete_job_logs" ON job_logs FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- worker_heartbeats (time-series)
-- ============================================================================
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id   UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    active_jobs INTEGER NOT NULL DEFAULT 0 CHECK (active_jobs >= 0),
    cpu_percent INTEGER NOT NULL DEFAULT 0 CHECK (cpu_percent >= 0),
    memory_mb   INTEGER NOT NULL DEFAULT 0 CHECK (memory_mb >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_worker_created ON worker_heartbeats (worker_id, created_at);
CREATE INDEX IF NOT EXISTS idx_heartbeats_created ON worker_heartbeats (created_at);

ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_worker_heartbeats" ON worker_heartbeats;
CREATE POLICY "anon_select_worker_heartbeats" ON worker_heartbeats FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_worker_heartbeats" ON worker_heartbeats;
CREATE POLICY "anon_insert_worker_heartbeats" ON worker_heartbeats FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_worker_heartbeats" ON worker_heartbeats;
CREATE POLICY "anon_update_worker_heartbeats" ON worker_heartbeats FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_worker_heartbeats" ON worker_heartbeats;
CREATE POLICY "anon_delete_worker_heartbeats" ON worker_heartbeats FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- scheduled_jobs (1:1 with jobs of type scheduled/delayed/recurring)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    cron_expr    TEXT,
    next_run_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_run_at  TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_scheduled_next_run
    ON scheduled_jobs (next_run_at)
    WHERE is_active = true;

ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "anon_select_scheduled_jobs" ON scheduled_jobs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "anon_insert_scheduled_jobs" ON scheduled_jobs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "anon_update_scheduled_jobs" ON scheduled_jobs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "anon_delete_scheduled_jobs" ON scheduled_jobs FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- dead_letter_queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    queue_id   UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    reason     TEXT NOT NULL,
    payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts   INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    moved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlq_queue_id ON dead_letter_queue (queue_id);
CREATE INDEX IF NOT EXISTS idx_dlq_moved_at ON dead_letter_queue (moved_at);

ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_dlq" ON dead_letter_queue;
CREATE POLICY "anon_select_dlq" ON dead_letter_queue FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dlq" ON dead_letter_queue;
CREATE POLICY "anon_insert_dlq" ON dead_letter_queue FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dlq" ON dead_letter_queue;
CREATE POLICY "anon_update_dlq" ON dead_letter_queue FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dlq" ON dead_letter_queue;
CREATE POLICY "anon_delete_dlq" ON dead_letter_queue FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- queue_stats (denormalized rollup, 1:1 with queues)
-- ============================================================================
CREATE TABLE IF NOT EXISTS queue_stats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id            UUID NOT NULL UNIQUE REFERENCES queues(id) ON DELETE CASCADE,
    total_jobs          INTEGER NOT NULL DEFAULT 0 CHECK (total_jobs >= 0),
    queued              INTEGER NOT NULL DEFAULT 0 CHECK (queued >= 0),
    running             INTEGER NOT NULL DEFAULT 0 CHECK (running >= 0),
    completed           INTEGER NOT NULL DEFAULT 0 CHECK (completed >= 0),
    failed              INTEGER NOT NULL DEFAULT 0 CHECK (failed >= 0),
    dead_lettered       INTEGER NOT NULL DEFAULT 0 CHECK (dead_lettered >= 0),
    avg_duration_ms     NUMERIC(12,2) NOT NULL DEFAULT 0,
    throughput_per_min  NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE queue_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_queue_stats" ON queue_stats;
CREATE POLICY "anon_select_queue_stats" ON queue_stats FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_queue_stats" ON queue_stats;
CREATE POLICY "anon_insert_queue_stats" ON queue_stats FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_queue_stats" ON queue_stats;
CREATE POLICY "anon_update_queue_stats" ON queue_stats FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_queue_stats" ON queue_stats;
CREATE POLICY "anon_delete_queue_stats" ON queue_stats FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- updated_at trigger for queues
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_queues_updated_at ON queues;
CREATE TRIGGER trigger_queues_updated_at
    BEFORE UPDATE ON queues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Auto-create queue_stats row when a queue is created
-- ============================================================================
CREATE OR REPLACE FUNCTION create_queue_stats_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO queue_stats (queue_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_queue_stats ON queues;
CREATE TRIGGER trigger_create_queue_stats
    AFTER INSERT ON queues
    FOR EACH ROW
    EXECUTE FUNCTION create_queue_stats_on_insert();

-- ============================================================================
-- Function to refresh queue_stats (called by worker edge function)
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_queue_stats(p_queue_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    q RECORD;
BEGIN
    IF p_queue_id IS NOT NULL THEN
        SELECT * INTO q FROM queues WHERE id = p_queue_id;
        IF q.id IS NULL THEN RETURN; END IF;
        UPDATE queue_stats SET
            total_jobs = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id),
            queued = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status = 'queued'),
            running = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status IN ('claimed', 'running')),
            completed = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status = 'completed'),
            failed = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status = 'failed'),
            dead_lettered = (SELECT COUNT(*) FROM dead_letter_queue WHERE queue_id = q.id),
            avg_duration_ms = COALESCE((SELECT AVG(duration_ms) FROM job_executions je JOIN jobs j ON je.job_id = j.id WHERE j.queue_id = q.id AND je.status = 'success'), 0),
            throughput_per_min = COALESCE((SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status = 'completed' AND finished_at > now() - interval '1 minute'), 0),
            updated_at = now()
        WHERE queue_id = q.id;
    ELSE
        FOR q IN SELECT * FROM queues LOOP
            UPDATE queue_stats SET
                total_jobs = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id),
                queued = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status = 'queued'),
                running = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status IN ('claimed', 'running')),
                completed = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status = 'completed'),
                failed = (SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status = 'failed'),
                dead_lettered = (SELECT COUNT(*) FROM dead_letter_queue WHERE queue_id = q.id),
                avg_duration_ms = COALESCE((SELECT AVG(duration_ms) FROM job_executions je JOIN jobs j ON je.job_id = j.id WHERE j.queue_id = q.id AND je.status = 'success'), 0),
                throughput_per_min = COALESCE((SELECT COUNT(*) FROM jobs WHERE queue_id = q.id AND status = 'completed' AND finished_at > now() - interval '1 minute'), 0),
                updated_at = now()
            WHERE queue_id = q.id;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;
