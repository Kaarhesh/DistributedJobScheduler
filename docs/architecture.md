# Architecture

## Overview

JobFlow is a distributed job scheduler built on a **database-as-queue** architecture.
Instead of using a separate message broker (Redis, RabbitMQ), jobs live in PostgreSQL
and workers claim them atomically using `SELECT ... FOR UPDATE SKIP LOCKED`.

This approach trades some throughput for strong consistency, transactional guarantees,
and operational simplicity — one system to monitor, back up, and reason about.

## Components

### 1. Frontend (React Dashboard)

- **Tech:** React 18, TypeScript, Tailwind CSS, Vite
- **Pages:** Dashboard, Queues, Jobs, Workers, Scheduled, Dead Letter, Metrics
- **Data access:** Direct to Supabase Postgres via the anon-key client (RLS-enabled)
- **Real-time:** 5-second polling intervals on all list views
- **Dark mode:** Class-based, persisted to localStorage

### 2. Database (Supabase Postgres)

14 tables organized in 3NF (with two documented denormalizations):

- `queues` — work queues with priority, concurrency, pause/resume
- `jobs` — the hot table; one row per unit of work
- `job_executions` — one row per attempt (retry history)
- `job_logs` — execution logs
- `workers` — worker process registry
- `worker_heartbeats` — time-series health metrics
- `retry_policies` — per-queue retry configuration
- `scheduled_jobs` — scheduling metadata
- `dead_letter_queue` — failed jobs after exhausting retries
- `queue_stats` — denormalized rollup for dashboard performance

### 3. Edge Functions (Supabase Deno Runtime)

- **`worker-tick`** — the worker process. Claims queued jobs, executes them,
  handles retries, moves failures to DLQ, reclaims stale jobs, refreshes stats.
- **`seed-demo`** — populates the database with demo data for testing.

### 4. RPC Functions

- **`claim_jobs`** — atomic job claiming with `SKIP LOCKED`
- **`requeue_from_dlq`** — moves a job from DLQ back to its queue
- **`refresh_queue_stats`** — recomputes the `queue_stats` rollup

## Concurrency Model

### Atomic Claiming

```sql
UPDATE jobs
SET status = 'claimed', worker_id = $1, claimed_at = now()
WHERE id IN (
  SELECT id FROM jobs
  WHERE queue_id = $2 AND status = 'queued' AND run_at <= now()
  ORDER BY priority DESC, run_at ASC
  LIMIT $3
  FOR UPDATE SKIP LOCKED
)
```

`SKIP LOCKED` ensures multiple workers can claim concurrently without blocking
each other — each worker gets a disjoint set of jobs.

### Lease + Heartbeat

- `claimed_at` + `worker_id` form a lease.
- A sweeper re-queues any `running` job whose `claimed_at` is older than 5 minutes
  (worker crashed).
- Workers send heartbeats to `worker_heartbeats` for monitoring.

### Idempotency

```sql
CREATE UNIQUE INDEX idx_jobs_idempotency
ON jobs (queue_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

A retried client request with the same idempotency key won't create a duplicate job.

## Job Lifecycle

```
queued → claimed → running → completed (success)
                            → retry → queued (back to start)
                            → dead → dead_letter_queue
```

## Retry Strategies

| Strategy | Delay formula |
|---|---|
| Fixed | `base_delay_ms` |
| Linear | `base_delay_ms * attempt` |
| Exponential | `base_delay_ms * 2^(attempt-1)` |

All capped at `max_delay_ms`. After `max_attempts`, the job moves to the DLQ.

## Performance Considerations

1. **Partial claim index** — `idx_jobs_claim` indexes only `status='queued'` rows,
   keeping `SKIP LOCKED` O(log n) regardless of table size.
2. **Denormalized `attempts`** — avoids `COUNT(*)` on `job_executions` per claim.
3. **`queue_stats` rollup** — dashboard reads one row per queue, not six aggregates.
4. **Partial scheduler index** — `idx_scheduled_next_run` indexes only active schedules.
