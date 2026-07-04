# Troubleshooting

## Common Issues

### Jobs are stuck in "queued" status

**Cause:** No worker has processed them yet.

**Fix:** Click "Run Worker Tick" on the dashboard. This triggers the `worker-tick` edge function, which claims and processes queued jobs.

---

### Jobs show "failed" but no retries happen

**Cause:** The job may have already exhausted its `max_attempts` (check the `attempts` column). Or the queue's retry policy has `max_attempts = 0`.

**Fix:**
1. Go to Queues → Settings and check the retry policy.
2. If the job is in the Dead Letter Queue, you can requeue it from the DLQ page.

---

### Queue stats are not updating

**Cause:** The `queue_stats` rollup is refreshed by the worker-tick function. If no ticks have run, stats are stale.

**Fix:** Run a worker tick. Stats refresh automatically at the end of each tick.

---

### "No queues yet" on dashboard

**Cause:** The database is empty.

**Fix:** Click "Seed Demo Data" on the dashboard to create demo queues, jobs, and a worker.

---

### Worker shows "dead" status

**Cause:** This is expected. The `worker-tick` edge function creates a temporary worker, processes jobs, then marks it as `dead`. Each tick creates a new worker. This simulates ephemeral serverless workers.

---

### Job creation fails with "duplicate key value"

**Cause:** You used an idempotency key that already exists for the same queue.

**Fix:** Use a unique idempotency key, or leave it blank. The unique constraint is `(queue_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

---

### Build fails with TypeScript errors

**Fix:** Run `npm run typecheck` to see all errors. Common causes:
- Unused imports (remove them)
- Missing type annotations on function returns
- Incorrect type assertions

---

### Edge function returns 500

**Cause:** The function hit an unhandled error. Check the response body for the error message.

**Common causes:**
- Database connection issues (transient)
- Missing RPC function (ensure migrations have been applied)
- Invalid job payload (malformed JSON)

---

### Dark mode not persisting

**Cause:** The theme is stored in `localStorage` under the key `theme`. If localStorage is cleared, it falls back to the system preference.

**Fix:** Toggle dark mode again — it will re-save to localStorage.

---

## Performance Tips

- **Large job counts:** The partial claim index (`idx_jobs_claim`) keeps `SKIP LOCKED` fast even with millions of rows. For very large scale, consider partitioning `jobs` by `created_at`.
- **High throughput:** Increase queue `concurrency_limit` and run multiple worker ticks in parallel.
- **Dashboard load:** The `queue_stats` rollup ensures the dashboard reads one row per queue, not six aggregates. Stats refresh at the end of each worker tick.
