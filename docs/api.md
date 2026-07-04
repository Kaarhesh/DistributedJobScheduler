# API Reference

## Edge Functions

### `worker-tick`

Processes queued jobs. Simulates a worker claiming, executing, and completing jobs.

**Request:**
```
POST /functions/v1/worker-tick
Authorization: Bearer <anon_key>
Content-Type: application/json
```

**Request body:** `{}` (empty)

**Response (200):**
```json
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

**What it does:**
1. Registers a worker process
2. Records a heartbeat
3. Fetches all active (unpaused) queues
4. For each queue, claims up to `concurrency_limit` queued jobs using `SKIP LOCKED`
5. Executes each job (simulated)
6. On success: marks job `completed`, records execution
7. On failure: schedules retry or moves to DLQ if max attempts exceeded
8. Activates due scheduled jobs
9. Reclaims stale jobs (worker crashed)
10. Marks worker as done
11. Refreshes queue stats

---

### `seed-demo`

Populates the database with demo data for testing.

**Request:**
```
POST /functions/v1/seed-demo
Authorization: Bearer <anon_key>
Content-Type: application/json
```

**Response (200):**
```json
{
  "queues": 5,
  "jobs": 32,
  "workers": 1
}
```

**What it creates:**
- 5 demo queues (email-processing, image-resizing, data-export, webhook-delivery, low-priority-tasks)
- Retry policies for each queue
- ~32 jobs across queues with random priorities and ~15% failure rate
- Historical completed/failed jobs for stats
- 1 demo worker with 10 heartbeats

---

## Database RPC Functions

### `claim_jobs(p_queue_id, p_worker_id, p_limit)`

Atomically claims up to `p_limit` queued jobs from a queue for a worker.

```sql
SELECT * FROM claim_jobs(
  'queue-uuid'::uuid,
  'worker-uuid'::uuid,
  5
);
```

Returns: table of claimed jobs (id, queue_id, type, status, priority, payload, attempts, worker_id)

---

### `requeue_from_dlq(p_dlq_id)`

Moves a job from the dead letter queue back to its original queue. Resets attempts to 0.

```sql
SELECT requeue_from_dlq('dlq-entry-uuid'::uuid);
```

---

### `refresh_queue_stats(p_queue_id?)`

Recomputes the `queue_stats` rollup for all queues (or a specific queue).

```sql
SELECT refresh_queue_stats();           -- all queues
SELECT refresh_queue_stats('queue-id'); -- one queue
```

---

## Database Tables

### `queues`

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid | gen_random_uuid() | Primary key |
| name | text | — | Unique queue name |
| description | text | null | Optional description |
| priority | int | 0 | Higher = more important |
| concurrency_limit | int | 10 | Max concurrent jobs |
| is_paused | bool | false | Paused queues don't accept new work |
| config | jsonb | '{}' | Free-form configuration |
| created_at | timestamptz | now() | — |
| updated_at | timestamptz | now() | Auto-updated by trigger |

### `jobs`

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid | gen_random_uuid() | Primary key |
| queue_id | uuid | — | FK to queues |
| type | text | 'immediate' | immediate/delayed/scheduled/recurring/batch |
| status | text | 'queued' | queued/scheduled/claimed/running/completed/failed/retry/dead |
| priority | int | 0 | Higher = processed first |
| payload | jsonb | '{}' | Job data |
| result | jsonb | null | Execution result |
| error | text | null | Last error message |
| attempts | int | 0 | Denormalized attempt count |
| worker_id | uuid | null | FK to workers |
| run_at | timestamptz | now() | When the job becomes claimable |
| claimed_at | timestamptz | null | When a worker claimed it |
| started_at | timestamptz | null | When execution started |
| finished_at | timestamptz | null | When execution finished |
| idempotency_key | text | null | Unique per queue to prevent duplicates |
| created_at | timestamptz | now() | — |

### `retry_policies`

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid | gen_random_uuid() | Primary key |
| queue_id | uuid | — | Unique FK to queues (1:1) |
| strategy | text | 'exponential' | fixed/linear/exponential |
| max_attempts | int | 3 | Max retry attempts |
| base_delay_ms | int | 1000 | Initial delay |
| max_delay_ms | int | 60000 | Delay cap |

### `workers`

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid | gen_random_uuid() | Primary key |
| name | text | — | Worker name |
| hostname | text | 'edge-function' | Hostname |
| concurrency | int | 5 | Max concurrent jobs |
| status | text | 'active' | active/draining/dead |
| registered_at | timestamptz | now() | — |
| last_seen_at | timestamptz | now() | Last heartbeat time |

### `dead_letter_queue`

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid | gen_random_uuid() | Primary key |
| job_id | uuid | — | FK to jobs |
| queue_id | uuid | — | FK to queues |
| reason | text | — | Failure reason |
| payload | jsonb | '{}' | Snapshot of job payload |
| attempts | int | 0 | How many times it tried |
| moved_at | timestamptz | now() | When it was moved to DLQ |
