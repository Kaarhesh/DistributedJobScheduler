import { useEffect, useState } from 'react';
import { Calendar, Plus, Power } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, Button, Select, Input, Textarea, Modal, Badge, EmptyState, Spinner } from '../components/ui';
import { formatRelativeTime, formatDateTime, classNames } from '../lib/utils';
import type { ScheduledJob, Job, Queue } from '../lib/types';

interface ScheduledJobWithRelations extends ScheduledJob {
  job?: Pick<Job, 'id' | 'type' | 'status' | 'priority' | 'payload'> | null;
  queue?: Pick<Queue, 'id' | 'name'> | null;
}

export function ScheduledPage() {
  const [scheduled, setScheduled] = useState<ScheduledJobWithRelations[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    queueId: '',
    cronExpr: '',
    priority: 0,
    payload: '{}',
  });

  const fetchScheduled = async () => {
    try {
      const { data, error } = await supabase
        .from('scheduled_jobs')
        .select('*, job:jobs(id, type, status, priority, payload, queue:queues(id, name))')
        .order('next_run_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      const mapped = (data || []).map((item: ScheduledJobWithRelations & { job: ScheduledJobWithRelations['job'] & { queue?: Pick<Queue, 'id' | 'name'> | null } }) => ({
        ...item,
        queue: item.job?.queue,
      })) as ScheduledJobWithRelations[];

      setScheduled(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scheduled jobs');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueues = async () => {
    const { data } = await supabase.from('queues').select('*').order('name');
    setQueues((data || []) as Queue[]);
  };

  useEffect(() => {
    fetchScheduled();
    fetchQueues();
    const interval = setInterval(fetchScheduled, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async () => {
    setError(null);
    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(form.payload);
      } catch {
        throw new Error('Invalid JSON in payload');
      }

      const nextRun = new Date();
      nextRun.setMinutes(nextRun.getMinutes() + 1);

      const { data: job, error: jErr } = await supabase
        .from('jobs')
        .insert({
          queue_id: form.queueId,
          type: 'recurring',
          status: 'scheduled',
          priority: form.priority,
          payload,
          run_at: nextRun.toISOString(),
        })
        .select()
        .single();

      if (jErr) throw jErr;

      const { error: sErr } = await supabase.from('scheduled_jobs').insert({
        job_id: job.id,
        cron_expr: form.cronExpr || null,
        next_run_at: nextRun.toISOString(),
        is_active: true,
      });

      if (sErr) throw sErr;

      setShowCreate(false);
      setForm({ queueId: '', cronExpr: '', priority: 0, payload: '{}' });
      fetchScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scheduled job');
    }
  };

  const handleToggle = async (item: ScheduledJobWithRelations) => {
    try {
      const { error } = await supabase
        .from('scheduled_jobs')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);
      if (error) throw error;
      fetchScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scheduled Jobs</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Recurring and delayed jobs managed by the scheduler
          </p>
        </div>
        <Button onClick={() => { fetchQueues(); setShowCreate(true); }} disabled={queues.length === 0}>
          <Plus className="h-4 w-4" />
          New Schedule
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {scheduled.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Calendar className="h-6 w-6" />}
            title="No scheduled jobs"
            description="Create a recurring or delayed job to run on a schedule. Supports cron expressions for flexible scheduling."
            action={
              queues.length > 0 ? (
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" />
                  Create Schedule
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {scheduled.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={classNames(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      item.is_active
                        ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-700'
                    )}
                  >
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {item.queue?.name || 'Unknown'}
                      </h3>
                      <Badge
                        className={item.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {item.cron_expr && (
                      <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {item.cron_expr}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(item)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <Power className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Next Run</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                    {formatDateTime(item.next_run_at)}
                  </p>
                  <p className="text-xs text-gray-400">{formatRelativeTime(item.next_run_at)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Last Run</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                    {item.last_run_at ? formatRelativeTime(item.last_run_at) : 'Never'}
                  </p>
                </div>
              </div>

              {item.job?.payload && Object.keys(item.job.payload).length > 0 && (
                <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  {JSON.stringify(item.job.payload, null, 2)}
                </pre>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Scheduled Job"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!form.queueId}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Queue"
            value={form.queueId}
            onChange={(v) => setForm({ ...form, queueId: v })}
            options={[
              { value: '', label: 'Select a queue...' },
              ...queues.map((q) => ({ value: q.id, label: q.name })),
            ]}
            required
          />
          <Input
            label="Cron Expression (optional)"
            value={form.cronExpr}
            onChange={(v) => setForm({ ...form, cronExpr: v })}
            placeholder="*/5 * * * * (every 5 minutes)"
          />
          <Input
            label="Priority"
            type="number"
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: Number(v) })}
            min={0}
          />
          <Textarea
            label="Payload (JSON)"
            value={form.payload}
            onChange={(v) => setForm({ ...form, payload: v })}
            placeholder='{"task": "cleanup"}'
            rows={4}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            If no cron expression is provided, the job will run once at the scheduled time.
            The first run will be approximately 1 minute from now.
          </p>
        </div>
      </Modal>
    </div>
  );
}
