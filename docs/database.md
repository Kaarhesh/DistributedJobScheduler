# Database Design

This document describes the PostgreSQL schema for the Distributed Job Scheduler.
The authoritative source is `backend/prisma/schema.prisma`; this document and
`database/schema.sql` are human-readable mirrors.

## Tables

| Table | Purpose |
|---|---|
| `users` | Authentication identity (email + bcrypt hash). |
| `organizations` | Tenancy boundary. |
| `organization_members` | M:N users↔orgs with role (RBAC). |
| `projects` | Logical grouping of queues within an org. |
| `queues` | Unit of work routing; priority, concurrency, pause, config. |
| `retry_policies` | 1:1 with queues; retry strategy + limits. |
| `jobs` | The hot table; one row per unit of work. |
| `job_executions` | One row per attempt (retry history). |
| `job_logs` | Free-form log lines emitted during execution. |
| `workers` | Registry of worker processes. |
| `worker_heartbeats` | Time-series of worker health. |
| `scheduled_jobs` | 1:1 with scheduled/delayed/recurring jobs. |
| `dead_letter_queue` | Parking lot for jobs that exhausted retries. |
| `queue_stats` | Denormalized rollup for the dashboard. |

## Concurrency primitives

- **`SELECT ... FOR UPDATE SKIP LOCKED`** — atomic, race-free job claiming.
- **Lease via `claimed_at` + `worker_id`** — a sweeper re-queues stale `running` jobs.
- **Idempotency key** — `UNIQUE (queue_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

## Key indexes

- `idx_jobs_claim` — partial index on `(queue_id, priority DESC, run_at) WHERE status='queued'`. The single most important index; keeps `SKIP LOCKED` O(log n).
- `idx_scheduled_next_run` — partial on `scheduled_jobs(next_run_at) WHERE is_active`. Keeps the scheduler tick fast.
- `idx_queues_active` — partial on `queues(project_id) WHERE is_paused=false`.
- `idx_jobs_idempotency` — partial unique for idempotency.

## Normalization

All tables are 3NF except:
- `queue_stats` — materialized rollup (documented denormalization).
- `jobs.attempts` — denormalized count (avoids `COUNT(*)` on the claim path).
- `queues.config`, `jobs.payload`, `jobs.result` — jsonb (validated at the app layer).

## ER diagram

See `database/er-diagram.mmd` (render with any Mermaid viewer).
