# JobFlow — Distributed Job Scheduler

A production-grade distributed job scheduler with priority queues, retry strategies, dead letter queues, scheduled jobs, worker management, and a real-time dashboard.

## Features

- **Priority Queues** — Jobs are routed to named queues with configurable priorities and concurrency limits.
- **Atomic Job Claiming** — Workers claim jobs using `SELECT ... FOR UPDATE SKIP LOCKED`, ensuring race-free distribution.
- **Retry Strategies** — Fixed, linear, and exponential backoff with configurable max attempts and delays.
- **Dead Letter Queue** — Jobs that exhaust retries are moved to a DLQ for manual review and requeue.
- **Scheduled & Recurring Jobs** — Support for delayed, one-shot scheduled, and cron-based recurring jobs.
- **Worker Management** — Worker registry with heartbeats, crash detection, and stale job reclamation.
- **Real-time Dashboard** — Live-updating React dashboard with dark mode, metrics, and per-queue stats.
- **Idempotency** — Optional idempotency keys prevent duplicate job creation.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite, Lucide Icons |
| Database | PostgreSQL (Supabase) |
| Backend | Supabase Edge Functions (Deno runtime) |
| Real-time | Supabase client with polling |

## Quick Start

1. The dev server is already running. Open the preview URL in your browser.
2. Click **"Seed Demo Data"** on the dashboard to populate queues, jobs, and a worker.
3. Click **"Run Worker Tick"** to process queued jobs — this simulates a worker claiming, executing, and completing jobs.
4. Explore the dashboard pages: Queues, Jobs, Workers, Scheduled, Dead Letter, Metrics.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Dashboard                    │
│  (Dashboard, Queues, Jobs, Workers, DLQ, Metrics)    │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
               │ Supabase Client       │ Edge Function Call
               │ (direct DB access     │ (worker-tick, seed-demo)
               │  via anon key)        │
               ▼                      ▼
┌──────────────────────┐  ┌──────────────────────────┐
│   Supabase Postgres   │  │  Supabase Edge Functions │
│                       │  │                          │
│  queues               │  │  worker-tick:            │
│  jobs (hot table)     │  │   - Claims queued jobs   │
│  job_executions       │  │   - Executes them        │
│  job_logs             │  │   - Handles retries      │
│  workers              │  │   - Moves to DLQ         │
│  worker_heartbeats    │  │   - Refreshes stats      │
│  retry_policies       │  │                          │
│  scheduled_jobs       │  │  seed-demo:              │
│  dead_letter_queue    │  │   - Creates demo data    │
│  queue_stats          │  │                          │
└──────────────────────┘  └──────────────────────────┘
```

## Database Schema

See `database/schema.sql` for the full SQL schema and `database/er-diagram.mmd` for the ER diagram.

### Key Tables

| Table | Purpose |
|---|---|
| `queues` | Work queues with priority, concurrency, pause/resume |
| `jobs` | The hot table — one row per unit of work |
| `job_executions` | One row per attempt (retry history) |
| `job_logs` | Log lines emitted during execution |
| `workers` | Registry of worker processes |
| `worker_heartbeats` | Time-series worker health metrics |
| `retry_policies` | Per-queue retry configuration |
| `scheduled_jobs` | Metadata for scheduled/delayed/recurring jobs |
| `dead_letter_queue` | Failed jobs after exhausting retries |
| `queue_stats` | Denormalized rollup for dashboard performance |

### Key Indexes

- `idx_jobs_claim` — Partial index on `(queue_id, priority DESC, run_at) WHERE status='queued'` for fast `SKIP LOCKED` polling.
- `idx_scheduled_next_run` — Partial on `scheduled_jobs(next_run_at) WHERE is_active` for fast scheduler ticks.
- `idx_jobs_idempotency` — Partial unique on `(queue_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

## API

### Edge Functions

#### `worker-tick` (POST)

Processes queued jobs. Called manually from the dashboard or by an external scheduler.

```json
// Response
{
  "processed": 15,
  "claimed": 15,
  "completed": 12,
  "failed": 3,
  "retried": 2,
  "dead_lettered": 1,
  "refreshed_stats": true
}
```

#### `seed-demo` (POST)

Populates the database with demo queues, jobs, and a worker for testing.

### RPC Functions

- `claim_jobs(p_queue_id, p_worker_id, p_limit)` — Atomic job claiming with `SKIP LOCKED`.
- `requeue_from_dlq(p_dlq_id)` — Moves a job from DLQ back to its queue.
- `refresh_queue_stats(p_queue_id?)` — Recomputes the `queue_stats` rollup.

## Job Lifecycle

```
                    ┌─────────┐
    Create ────────▶│ queued  │
                    └────┬────┘
                         │ claim (SKIP LOCKED)
                         ▼
                    ┌─────────┐
                    │ claimed │
                    └────┬────┘
                         │ start execution
                         ▼
                    ┌─────────┐
                    │ running │
                    └────┬────┘
              ┌──────────┼──────────┐
              │          │          │
         success     failure    timeout
              │          │          │
              ▼          ▼          ▼
        ┌──────────┐ ┌──────┐ ┌──────┐
        │completed │ │retry │ │retry │
        └──────────┘ └──┬───┘ └──┬───┘
                        │        │
                   max attempts  │
                        │        │
                        ▼        ▼
                   ┌──────┐  (reclaim)
                   │ dead │
                   └──────┘
```

## Retry Strategies

| Strategy | Formula | Example (base=1000ms) |
|---|---|---|
| Fixed | `base_delay` | 1000ms, 1000ms, 1000ms |
| Linear | `base_delay * attempt` | 1000ms, 2000ms, 3000ms |
| Exponential | `base_delay * 2^(attempt-1)` | 1000ms, 2000ms, 4000ms |

All delays are capped at `max_delay_ms`.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run typecheck # TypeScript checking
npm run lint     # ESLint
```

## License

MIT
