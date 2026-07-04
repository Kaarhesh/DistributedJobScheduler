import { useEffect, useState } from 'react';
import { Plus, Briefcase, ChevronRight, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Card,
  Button,
  Input,
  Select,
  Textarea,
  Modal,
  Badge,
  EmptyState,
  Spinner,
} from '../components/ui';
import {
  formatRelativeTime,
  formatDuration,
  classNames,
} from '../lib/utils';
import type {
  JobWithRelations,
  Queue,
  JobType,
} from '../lib/types';
import { JOB_STATUS_COLORS, JOB_STATUS_DOT_COLORS } from '../lib/types';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'retry', label: 'Retry' },
  { value: 'dead', label: 'Dead' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'batch', label: 'Batch' },
];

export function JobsPage() {
  const [jobs, setJobs] = useState<JobWithRelations[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobWithRelations | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterQueue, setFilterQueue] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const [form, setForm] = useState({
    queueId: '',
    type: 'immediate' as JobType,
    priority: 0,
    payload: '{}',
    idempotencyKey: '',
    runAt: '',
  });

  const fetchJobs = async () => {
    try {
      let query = supabase
        .from('jobs')
        .select('*, queue:queues(id, name), worker:workers(id, name)')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      if (filterQueue !== 'all') {
        query = query.eq('queue_id', filterQueue);
      }

      const { data, error } = await query;
      if (error) throw error;
      setJobs((data || []) as JobWithRelations[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueues = async () => {
    const { data } = await supabase.from('queues').select('*').order('name');
    setQueues((data || []) as Queue[]);
  };

  useEffect(() => {
    fetchJobs();
    fetchQueues();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [page, filterStatus, filterQueue]);

  const handleCreate = async () => {
    setError(null);
    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(form.payload);
      } catch {
        throw new Error('Invalid JSON in payload');
      }

      const jobData: Record<string, unknown> = {
        queue_id: form.queueId,
        type: form.type,
        priority: form.priority,
        payload,
      };

      if (form.idempotencyKey) {
        jobData.idempotency_key = form.idempotencyKey;
      }

      if (form.type === 'delayed' && form.runAt) {
        jobData.run_at = new Date(form.runAt).toISOString();
        jobData.status = 'scheduled';
      }

      const { error } = await supabase.from('jobs').insert(jobData);
      if (error) throw error;

      setShowCreate(false);
      setForm({
        queueId: '',
        type: 'immediate',
        priority: 0,
        payload: '{}',
        idempotencyKey: '',
        runAt: '',
      });
      fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Jobs</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View and manage all jobs across queues
          </p>
        </div>
        <Button onClick={() => { fetchQueues(); setShowCreate(true); }} disabled={queues.length === 0}>
          <Plus className="h-4 w-4" />
          New Job
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-gray-400" />
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_OPTIONS}
            className="w-40"
          />
          <Select
            value={filterQueue}
            onChange={setFilterQueue}
            options={[
              { value: 'all', label: 'All queues' },
              ...queues.map((q) => ({ value: q.id, label: q.name })),
            ]}
            className="w-40"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing {jobs.length} jobs
          </span>
        </div>
      </Card>

      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase className="h-6 w-6" />}
            title="No jobs found"
            description="No jobs match your current filters. Try changing the filter or create a new job."
            action={
              queues.length > 0 ? (
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" />
                  Create Job
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Queue
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Priority
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Attempts
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Created
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30"
                >
                  <td className="px-4 py-3">
                    <Badge
                      className={JOB_STATUS_COLORS[job.status]}
                      dot={JOB_STATUS_DOT_COLORS[job.status]}
                    >
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {job.queue?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {job.type}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {job.priority}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {job.attempts}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatRelativeTime(job.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-500 dark:text-gray-400">Page {page + 1}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={jobs.length < PAGE_SIZE}
            >
              Next
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Job"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!form.queueId}>
              Create Job
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
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Job Type"
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v as JobType })}
              options={TYPE_OPTIONS}
            />
            <Input
              label="Priority"
              type="number"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: Number(v) })}
              min={0}
            />
          </div>
          {form.type === 'delayed' && (
            <Input
              label="Run At (date & time)"
              type="datetime-local"
              value={form.runAt}
              onChange={(v) => setForm({ ...form, runAt: v })}
            />
          )}
          <Textarea
            label="Payload (JSON)"
            value={form.payload}
            onChange={(v) => setForm({ ...form, payload: v })}
            placeholder='{"key": "value"}'
            rows={6}
          />
          <Input
            label="Idempotency Key (optional)"
            value={form.idempotencyKey}
            onChange={(v) => setForm({ ...form, idempotencyKey: v })}
            placeholder="unique-key-to-prevent-duplicates"
          />
        </div>
      </Modal>

      <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}

function JobDetailModal({
  job,
  onClose,
}: {
  job: JobWithRelations | null;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<{ id: string; level: string; message: string; created_at: string }[]>([]);
  const [executions, setExecutions] = useState<{
    id: string;
    attempt_number: number;
    status: string;
    duration_ms: number;
    error: string | null;
    started_at: string;
  }[]>([]);

  useEffect(() => {
    if (!job) return;
    Promise.all([
      supabase
        .from('job_logs')
        .select('id, level, message, created_at')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('job_executions')
        .select('id, attempt_number, status, duration_ms, error, started_at')
        .eq('job_id', job.id)
        .order('attempt_number', { ascending: false }),
    ]).then(([logsRes, execRes]) => {
      if (logsRes.data) setLogs(logsRes.data);
      if (execRes.data) setExecutions(execRes.data);
    });
  }, [job]);

  if (!job) return null;

  return (
    <Modal open={!!job} onClose={onClose} title="Job Details" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Job ID</p>
            <p className="mt-0.5 font-mono text-sm text-gray-900 dark:text-white">{job.id}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
            <div className="mt-0.5">
              <Badge
                className={JOB_STATUS_COLORS[job.status]}
                dot={JOB_STATUS_DOT_COLORS[job.status]}
              >
                {job.status}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Queue</p>
            <p className="mt-0.5 text-sm text-gray-900 dark:text-white">{job.queue?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Type</p>
            <p className="mt-0.5 text-sm text-gray-900 dark:text-white">{job.type}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Priority</p>
            <p className="mt-0.5 text-sm text-gray-900 dark:text-white">{job.priority}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Attempts</p>
            <p className="mt-0.5 text-sm text-gray-900 dark:text-white">{job.attempts}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Worker</p>
            <p className="mt-0.5 text-sm text-gray-900 dark:text-white">{job.worker?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Created</p>
            <p className="mt-0.5 text-sm text-gray-900 dark:text-white">
              {formatRelativeTime(job.created_at)}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Payload</p>
          <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
            {JSON.stringify(job.payload, null, 2)}
          </pre>
        </div>

        {job.result && (
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Result</p>
            <pre className="overflow-x-auto rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
              {JSON.stringify(job.result, null, 2)}
            </pre>
          </div>
        )}

        {job.error && (
          <div>
            <p className="mb-1 text-xs font-medium text-red-500">Error</p>
            <pre className="overflow-x-auto rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {job.error}
            </pre>
          </div>
        )}

        {executions.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              Execution History ({executions.length})
            </p>
            <div className="space-y-2">
              {executions.map((exec) => (
                <div
                  key={exec.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      #{exec.attempt_number}
                    </span>
                    <Badge
                      className={classNames(
                        'text-xs',
                        exec.status === 'success'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      )}
                    >
                      {exec.status}
                    </Badge>
                    {exec.error && (
                      <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {exec.error}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDuration(exec.duration_ms)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              Logs ({logs.length})
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-gray-900 p-3 dark:bg-black">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2 font-mono text-xs">
                  <span className="text-gray-500">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                  <span
                    className={classNames(
                      'font-semibold',
                      log.level === 'error'
                        ? 'text-red-400'
                        : log.level === 'warn'
                        ? 'text-amber-400'
                        : log.level === 'info'
                        ? 'text-blue-400'
                        : 'text-gray-400'
                    )}
                  >
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="text-gray-300">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
