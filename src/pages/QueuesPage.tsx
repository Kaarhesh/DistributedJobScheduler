import { useEffect, useState } from 'react';
import { Plus, Pause, Play, Trash2, ListOrdered, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Card,
  Button,
  Input,
  Textarea,
  Select,
  Toggle,
  Modal,
  Badge,
  EmptyState,
  Spinner,
} from '../components/ui';
import { formatRelativeTime, classNames } from '../lib/utils';
import type { QueueWithStats, RetryStrategy } from '../lib/types';

export function QueuesPage() {
  const [queues, setQueues] = useState<QueueWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    priority: 0,
    concurrencyLimit: 10,
    isPaused: false,
    retryStrategy: 'exponential' as RetryStrategy,
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
  });

  const fetchQueues = async () => {
    try {
      const { data, error } = await supabase
        .from('queues')
        .select('*, retry_policies(*), queue_stats(*)')
        .order('priority', { ascending: false });

      if (error) throw error;
      setQueues((data || []) as QueueWithStats[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueues();
    const interval = setInterval(fetchQueues, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async () => {
    setError(null);
    try {
      const { data: queue, error: qErr } = await supabase
        .from('queues')
        .insert({
          name: form.name,
          description: form.description || null,
          priority: form.priority,
          concurrency_limit: form.concurrencyLimit,
          is_paused: form.isPaused,
          config: {},
        })
        .select()
        .single();

      if (qErr) throw qErr;

      const { error: rpErr } = await supabase.from('retry_policies').insert({
        queue_id: queue.id,
        strategy: form.retryStrategy,
        max_attempts: form.maxAttempts,
        base_delay_ms: form.baseDelayMs,
        max_delay_ms: form.maxDelayMs,
      });

      if (rpErr) throw rpErr;

      setShowCreate(false);
      setForm({
        name: '',
        description: '',
        priority: 0,
        concurrencyLimit: 10,
        isPaused: false,
        retryStrategy: 'exponential',
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 60000,
      });
      fetchQueues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create queue');
    }
  };

  const handleTogglePause = async (queue: QueueWithStats) => {
    try {
      const { error } = await supabase
        .from('queues')
        .update({ is_paused: !queue.is_paused })
        .eq('id', queue.id);
      if (error) throw error;
      fetchQueues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle pause');
    }
  };

  const handleDelete = async (queue: QueueWithStats) => {
    if (!confirm(`Delete queue "${queue.name}"? This will also delete all jobs in this queue.`)) return;
    try {
      const { error } = await supabase.from('queues').delete().eq('id', queue.id);
      if (error) throw error;
      fetchQueues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete queue');
    }
  };

  const handleUpdateSettings = async () => {
    if (!showSettings) return;
    setError(null);
    try {
      const queue = queues.find((q) => q.id === showSettings);
      if (!queue) return;

      const { error: qErr } = await supabase
        .from('queues')
        .update({
          priority: form.priority,
          concurrency_limit: form.concurrencyLimit,
        })
        .eq('id', queue.id);
      if (qErr) throw qErr;

      if (queue.retry_policies) {
        const { error: rpErr } = await supabase
          .from('retry_policies')
          .update({
            strategy: form.retryStrategy,
            max_attempts: form.maxAttempts,
            base_delay_ms: form.baseDelayMs,
            max_delay_ms: form.maxDelayMs,
          })
          .eq('id', queue.retry_policies.id);
        if (rpErr) throw rpErr;
      }

      setShowSettings(null);
      fetchQueues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  const openSettings = (queue: QueueWithStats) => {
    setForm({
      priority: queue.priority,
      concurrencyLimit: queue.concurrency_limit,
      retryStrategy: queue.retry_policies?.strategy || 'exponential',
      maxAttempts: queue.retry_policies?.max_attempts || 3,
      baseDelayMs: queue.retry_policies?.base_delay_ms || 1000,
      maxDelayMs: queue.retry_policies?.max_delay_ms || 60000,
      name: '',
      description: '',
      isPaused: false,
    });
    setShowSettings(queue.id);
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Queues</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage work queues, priorities, and retry policies
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New Queue
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {queues.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListOrdered className="h-6 w-6" />}
            title="No queues yet"
            description="Create your first queue to start scheduling jobs. Each queue has its own priority, concurrency limit, and retry policy."
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Create Queue
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {queues.map((q) => {
            const qs = q.queue_stats;
            return (
              <Card key={q.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={classNames(
                        'flex h-10 w-10 items-center justify-center rounded-lg',
                        q.is_paused
                          ? 'bg-gray-100 text-gray-400 dark:bg-gray-700'
                          : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      )}
                    >
                      <ListOrdered className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {q.name}
                        </h3>
                        {q.is_paused && (
                          <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            Paused
                          </Badge>
                        )}
                      </div>
                      {q.description && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {q.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openSettings(q)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleTogglePause(q)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      {q.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(q)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Priority</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                      {q.priority}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Concurrency</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                      {q.concurrency_limit}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Retry</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                      {q.retry_policies?.strategy || 'none'} · {q.retry_policies?.max_attempts || 0}x
                    </p>
                  </div>
                </div>

                {qs && (
                  <div className="mt-4 grid grid-cols-5 gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                    <div>
                      <p className="text-xs text-gray-400">Queued</p>
                      <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{qs.queued}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Running</p>
                      <p className="text-sm font-bold text-orange-600 dark:text-orange-400">{qs.running}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Done</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{qs.completed}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Failed</p>
                      <p className="text-sm font-bold text-red-600 dark:text-red-400">{qs.failed}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">DLQ</p>
                      <p className="text-sm font-bold text-gray-600 dark:text-gray-400">{qs.dead_lettered}</p>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-gray-400">
                  Created {formatRelativeTime(q.created_at)}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Queue"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!form.name}>
              Create Queue
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Queue Name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="e.g. email-processing"
            required
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
            placeholder="What does this queue do?"
            rows={2}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Priority (higher = more important)"
              type="number"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: Number(v) })}
              min={0}
            />
            <Input
              label="Concurrency Limit"
              type="number"
              value={form.concurrencyLimit}
              onChange={(v) => setForm({ ...form, concurrencyLimit: Number(v) })}
              min={1}
            />
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Retry Policy
            </p>
            <div className="space-y-3">
              <Select
                label="Strategy"
                value={form.retryStrategy}
                onChange={(v) => setForm({ ...form, retryStrategy: v as RetryStrategy })}
                options={[
                  { value: 'fixed', label: 'Fixed delay' },
                  { value: 'linear', label: 'Linear backoff' },
                  { value: 'exponential', label: 'Exponential backoff' },
                ]}
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Max Attempts"
                  type="number"
                  value={form.maxAttempts}
                  onChange={(v) => setForm({ ...form, maxAttempts: Number(v) })}
                  min={0}
                />
                <Input
                  label="Base Delay (ms)"
                  type="number"
                  value={form.baseDelayMs}
                  onChange={(v) => setForm({ ...form, baseDelayMs: Number(v) })}
                  min={0}
                />
                <Input
                  label="Max Delay (ms)"
                  type="number"
                  value={form.maxDelayMs}
                  onChange={(v) => setForm({ ...form, maxDelayMs: Number(v) })}
                  min={0}
                />
              </div>
            </div>
          </div>
          <Toggle
            checked={form.isPaused}
            onChange={(v) => setForm({ ...form, isPaused: v })}
            label="Start paused"
          />
        </div>
      </Modal>

      <Modal
        open={!!showSettings}
        onClose={() => setShowSettings(null)}
        title="Queue Settings"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSettings(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSettings}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Priority"
              type="number"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: Number(v) })}
              min={0}
            />
            <Input
              label="Concurrency Limit"
              type="number"
              value={form.concurrencyLimit}
              onChange={(v) => setForm({ ...form, concurrencyLimit: Number(v) })}
              min={1}
            />
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Retry Policy
            </p>
            <div className="space-y-3">
              <Select
                label="Strategy"
                value={form.retryStrategy}
                onChange={(v) => setForm({ ...form, retryStrategy: v as RetryStrategy })}
                options={[
                  { value: 'fixed', label: 'Fixed delay' },
                  { value: 'linear', label: 'Linear backoff' },
                  { value: 'exponential', label: 'Exponential backoff' },
                ]}
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Max Attempts"
                  type="number"
                  value={form.maxAttempts}
                  onChange={(v) => setForm({ ...form, maxAttempts: Number(v) })}
                  min={0}
                />
                <Input
                  label="Base Delay (ms)"
                  type="number"
                  value={form.baseDelayMs}
                  onChange={(v) => setForm({ ...form, baseDelayMs: Number(v) })}
                  min={0}
                />
                <Input
                  label="Max Delay (ms)"
                  type="number"
                  value={form.maxDelayMs}
                  onChange={(v) => setForm({ ...form, maxDelayMs: Number(v) })}
                  min={0}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
