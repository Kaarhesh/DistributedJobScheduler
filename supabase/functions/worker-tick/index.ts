import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

interface Job {
  id: string;
  queue_id: string;
  type: string;
  status: string;
  priority: number;
  payload: Record<string, unknown>;
  attempts: number;
  worker_id: string | null;
}

interface Queue {
  id: string;
  name: string;
  concurrency_limit: number;
  is_paused: boolean;
}

interface RetryPolicy {
  queue_id: string;
  strategy: string;
  max_attempts: number;
  base_delay_ms: number;
  max_delay_ms: number;
}

function computeRetryDelay(strategy: string, attempt: number, baseMs: number, maxMs: number): number {
  let delay: number;
  switch (strategy) {
    case "fixed":
      delay = baseMs;
      break;
    case "linear":
      delay = baseMs * attempt;
      break;
    case "exponential":
      delay = baseMs * Math.pow(2, attempt - 1);
      break;
    default:
      delay = baseMs;
  }
  return Math.min(delay, maxMs);
}

async function simulateJobExecution(payload: Record<string, unknown>): Promise<{ result: Record<string, unknown>; shouldFail: boolean; error?: string }> {
  const task = (payload.task as string) || (payload.type as string) || "unknown";
  const forceFail = payload.forceFail === true || payload.should_fail === true;
  const durationMs = (payload.durationMs as number) || (payload.duration as number) || Math.floor(Math.random() * 500) + 100;

  await new Promise((resolve) => setTimeout(resolve, Math.min(durationMs, 2000)));

  if (forceFail) {
    return {
      result: {},
      shouldFail: true,
      error: payload.errorMessage as string || "Simulated failure (forceFail=true)",
    };
  }

  return {
    result: {
      task,
      executedAt: new Date().toISOString(),
      durationMs,
      output: `Processed task "${task}" successfully`,
    },
    shouldFail: false,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const result = {
      processed: 0,
      claimed: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      dead_lettered: 0,
      refreshed_stats: false,
    };

    // 1. Register or update a worker record
    const workerName = `edge-worker-${Date.now()}`;
    const { data: worker, error: wErr } = await supabase
      .from("workers")
      .insert({
        name: workerName,
        hostname: "edge-function",
        concurrency: 5,
        status: "active",
      })
      .select()
      .single();

    if (wErr) throw wErr;
    const workerId = worker.id;

    // Record a heartbeat
    await supabase.from("worker_heartbeats").insert({
      worker_id: workerId,
      active_jobs: 0,
      cpu_percent: Math.floor(Math.random() * 30) + 10,
      memory_mb: Math.floor(Math.random() * 200) + 100,
    });

    // 2. Fetch active, unpaused queues
    const { data: queues, error: qErr } = await supabase
      .from("queues")
      .select("*")
      .eq("is_paused", false);

    if (qErr) throw qErr;

    // 3. Fetch retry policies for all queues
    const { data: retryPolicies } = await supabase
      .from("retry_policies")
      .select("*");

    const policyMap = new Map<string, RetryPolicy>();
    for (const rp of retryPolicies || []) {
      policyMap.set(rp.queue_id, rp as RetryPolicy);
    }

    // 4. Process each queue
    for (const queue of (queues || []) as Queue[]) {
      // Check how many jobs are already running for this queue
      const { count: runningCount } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("queue_id", queue.id)
        .in("status", ["claimed", "running"]);

      const availableSlots = queue.concurrency_limit - (runningCount || 0);
      if (availableSlots <= 0) continue;

      // Claim jobs using atomic UPDATE ... WHERE status = 'queued' (simulating SKIP LOCKED)
      // Since we can't do raw SQL via the client, we use an RPC function
      const { data: claimedJobs, error: claimErr } = await supabase.rpc("claim_jobs", {
        p_queue_id: queue.id,
        p_worker_id: workerId,
        p_limit: availableSlots,
      });

      if (claimErr) {
        console.error("Claim error:", claimErr);
        continue;
      }

      const jobs = (claimedJobs || []) as Job[];
      result.claimed += jobs.length;

      // 5. Execute each claimed job
      for (const job of jobs) {
        result.processed++;

        // Create execution record
        const { data: execution } = await supabase
          .from("job_executions")
          .insert({
            job_id: job.id,
            worker_id: workerId,
            attempt_number: job.attempts + 1,
            status: "running",
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        // Update job to running
        await supabase
          .from("jobs")
          .update({
            status: "running",
            started_at: new Date().toISOString(),
            attempts: job.attempts + 1,
          })
          .eq("id", job.id);

        // Execute the job
        const execResult = await simulateJobExecution(job.payload);
        const finishedAt = new Date().toISOString();
        const durationMs = execution
          ? new Date(finishedAt).getTime() - new Date(execution.started_at).getTime()
          : 0;

        if (execResult.shouldFail) {
          // Job failed
          result.failed++;

          const policy = policyMap.get(queue.id);
          const maxAttempts = policy?.max_attempts ?? 3;
          const newAttempts = job.attempts + 1;

          // Update execution record
          await supabase
            .from("job_executions")
            .update({
              status: "failed",
              duration_ms: durationMs,
              error: execResult.error,
              finished_at: finishedAt,
            })
            .eq("id", execution?.id);

          if (newAttempts >= maxAttempts) {
            // Move to dead letter queue
            await supabase
              .from("jobs")
              .update({
                status: "dead",
                error: execResult.error,
                finished_at: finishedAt,
              })
              .eq("id", job.id);

            await supabase.from("dead_letter_queue").insert({
              job_id: job.id,
              queue_id: queue.id,
              reason: execResult.error || "Max retries exceeded",
              payload: job.payload,
              attempts: newAttempts,
            });

            result.dead_lettered++;
          } else {
            // Schedule retry
            const delay = computeRetryDelay(
              policy?.strategy || "exponential",
              newAttempts,
              policy?.base_delay_ms || 1000,
              policy?.max_delay_ms || 60000
            );

            const runAt = new Date(Date.now() + delay).toISOString();

            await supabase
              .from("jobs")
              .update({
                status: "queued",
                error: execResult.error,
                run_at: runAt,
                worker_id: null,
                finished_at: finishedAt,
              })
              .eq("id", job.id);

            result.retried++;
          }

          // Log the error
          await supabase.from("job_logs").insert({
            job_id: job.id,
            level: "error",
            message: `Attempt ${job.attempts + 1} failed: ${execResult.error}`,
            metadata: { attempt: job.attempts + 1, error: execResult.error },
          });
        } else {
          // Job succeeded
          result.completed++;

          await supabase
            .from("job_executions")
            .update({
              status: "success",
              duration_ms: durationMs,
              finished_at: finishedAt,
            })
            .eq("id", execution?.id);

          await supabase
            .from("jobs")
            .update({
              status: "completed",
              result: execResult.result,
              finished_at: finishedAt,
            })
            .eq("id", job.id);

          await supabase.from("job_logs").insert({
            job_id: job.id,
            level: "info",
            message: `Job completed successfully in ${durationMs}ms`,
            metadata: { duration_ms: durationMs, result: execResult.result },
          });
        }
      }
    }

    // 6. Process scheduled jobs that are due
    const { data: dueScheduled } = await supabase
      .from("scheduled_jobs")
      .select("*, job:jobs(*)")
      .eq("is_active", true)
      .lte("next_run_at", new Date().toISOString())
      .limit(10);

    for (const sched of dueScheduled || []) {
      const job = sched.job as Job;
      if (!job || job.status !== "scheduled") continue;

      // Activate the job (move to queued)
      await supabase
        .from("jobs")
        .update({ status: "queued", run_at: new Date().toISOString() })
        .eq("id", job.id);

      // Update next run time if recurring (cron)
      if (sched.cron_expr) {
        const nextRun = new Date(Date.now() + 60_000); // simplified: +1 min
        await supabase
          .from("scheduled_jobs")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRun.toISOString(),
          })
          .eq("id", sched.id);
      } else {
        // One-shot scheduled job — deactivate
        await supabase
          .from("scheduled_jobs")
          .update({
            is_active: false,
            last_run_at: new Date().toISOString(),
          })
          .eq("id", sched.id);
      }
    }

    // 7. Reclaim stale jobs (worker died) — jobs running for > 5 minutes
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: staleJobs } = await supabase
      .from("jobs")
      .select("id")
      .in("status", ["claimed", "running"])
      .lt("claimed_at", staleThreshold)
      .limit(20);

    for (const stale of staleJobs || []) {
      await supabase
        .from("jobs")
        .update({
          status: "queued",
          worker_id: null,
          claimed_at: null,
          started_at: null,
        })
        .eq("id", stale.id);
    }

    // 8. Mark worker as done and update heartbeat
    await supabase
      .from("workers")
      .update({
        status: "dead",
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", workerId);

    // 9. Refresh queue stats
    await supabase.rpc("refresh_queue_stats");
    result.refreshed_stats = true;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
