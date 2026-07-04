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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const results = {
      queues: 0,
      jobs: 0,
      workers: 0,
    };

    // 1. Create demo queues if they don't exist
    const demoQueues = [
      {
        name: "email-processing",
        description: "Outbound email delivery queue",
        priority: 10,
        concurrency_limit: 20,
        is_paused: false,
        config: {},
      },
      {
        name: "image-resizing",
        description: "Image processing and thumbnail generation",
        priority: 5,
        concurrency_limit: 5,
        is_paused: false,
        config: {},
      },
      {
        name: "data-export",
        description: "Large data export and report generation",
        priority: 3,
        concurrency_limit: 2,
        is_paused: false,
        config: {},
      },
      {
        name: "webhook-delivery",
        description: "Outgoing webhook delivery with retries",
        priority: 8,
        concurrency_limit: 15,
        is_paused: false,
        config: {},
      },
      {
        name: "low-priority-tasks",
        description: "Background maintenance and cleanup tasks",
        priority: 1,
        concurrency_limit: 3,
        is_paused: true,
        config: {},
      },
    ];

    const queueIds: Record<string, string> = {};

    for (const q of demoQueues) {
      const { data: existing } = await supabase
        .from("queues")
        .select("id")
        .eq("name", q.name)
        .maybeSingle();

      if (existing) {
        queueIds[q.name] = existing.id;
        continue;
      }

      const { data: created, error } = await supabase
        .from("queues")
        .insert(q)
        .select()
        .single();

      if (error) {
        console.error("Queue create error:", error);
        continue;
      }

      queueIds[q.name] = created.id;
      results.queues++;

      // Create retry policy
      await supabase.from("retry_policies").insert({
        queue_id: created.id,
        strategy: "exponential",
        max_attempts: 3,
        base_delay_ms: 1000,
        max_delay_ms: 30000,
      });
    }

    // 2. Create demo jobs across queues
    const jobTemplates = [
      { queue: "email-processing", task: "send-welcome-email", count: 8 },
      { queue: "email-processing", task: "send-password-reset", count: 3 },
      { queue: "image-resizing", task: "resize-avatar", count: 5 },
      { queue: "image-resizing", task: "generate-thumbnail", count: 4 },
      { queue: "data-export", task: "export-csv", count: 2 },
      { queue: "webhook-delivery", task: "deliver-stripe-webhook", count: 6 },
      { queue: "webhook-delivery", task: "deliver-slack-notification", count: 4 },
    ];

    for (const tmpl of jobTemplates) {
      const qId = queueIds[tmpl.queue];
      if (!qId) continue;

      for (let i = 0; i < tmpl.count; i++) {
        const shouldFail = Math.random() < 0.15;
        const jobsToInsert = [];

        jobsToInsert.push({
          queue_id: qId,
          type: "immediate",
          status: "queued",
          priority: Math.floor(Math.random() * 10),
          payload: {
            task: `${tmpl.task}-${i + 1}`,
            forceFail: shouldFail,
            durationMs: Math.floor(Math.random() * 1000) + 200,
            metadata: {
              source: "demo-seed",
              index: i,
            },
          },
        });

        const { error } = await supabase.from("jobs").insert(jobsToInsert);
        if (!error) results.jobs += jobsToInsert.length;
      }
    }

    // Add some already-completed and failed jobs for stats
    for (const [qName, qId] of Object.entries(queueIds)) {
      for (let i = 0; i < 5; i++) {
        const isFail = Math.random() < 0.2;
        const finishedAt = new Date(Date.now() - Math.random() * 3600_000).toISOString();
        const startedAt = new Date(new Date(finishedAt).getTime() - Math.floor(Math.random() * 2000) - 500).toISOString();

        await supabase.from("jobs").insert({
          queue_id: qId,
          type: "immediate",
          status: isFail ? "failed" : "completed",
          priority: Math.floor(Math.random() * 10),
          payload: { task: `historical-${qName}-${i}`, source: "demo-seed" },
          result: isFail ? null : { output: "done", durationMs: Math.floor(Math.random() * 1000) + 100 },
          error: isFail ? "Simulated historical failure" : null,
          attempts: isFail ? 3 : 1,
          started_at: startedAt,
          finished_at: finishedAt,
        });

        // Add execution record
        const { data: job } = await supabase
          .from("jobs")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (job) {
          await supabase.from("job_executions").insert({
            job_id: job.id,
            attempt_number: 1,
            status: isFail ? "failed" : "success",
            duration_ms: Math.floor(Math.random() * 1000) + 100,
            error: isFail ? "Simulated failure" : null,
            started_at: startedAt,
            finished_at: finishedAt,
          });
        }
      }
    }

    // 3. Create a demo worker
    const { data: existingWorker } = await supabase
      .from("workers")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (!existingWorker) {
      const { data: worker } = await supabase
        .from("workers")
        .insert({
          name: "demo-worker-1",
          hostname: "demo.local",
          concurrency: 10,
          status: "active",
        })
        .select()
        .single();

      if (worker) {
        results.workers++;
        // Add some heartbeats
        for (let i = 0; i < 10; i++) {
          await supabase.from("worker_heartbeats").insert({
            worker_id: worker.id,
            active_jobs: Math.floor(Math.random() * 10),
            cpu_percent: Math.floor(Math.random() * 50) + 10,
            memory_mb: Math.floor(Math.random() * 300) + 150,
            created_at: new Date(Date.now() - (10 - i) * 10_000).toISOString(),
          });
        }
      }
    }

    // 4. Refresh stats
    await supabase.rpc("refresh_queue_stats");

    return new Response(JSON.stringify(results), {
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
