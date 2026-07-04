import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, Button, Badge, EmptyState, Spinner } from '../components/ui';
import { formatRelativeTime } from '../lib/utils';
import type { DeadLetterJob } from '../lib/types';

export function DeadLetterPage() {
  const [dlqJobs, setDlqJobs] = useState<DeadLetterJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDLQ = async () => {
    try {
      const { data, error } = await supabase
        .from('dead_letter_queue')
        .select('*, queue:queues(id, name), job:jobs(id, type, priority)')
        .order('moved_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setDlqJobs((data || []) as DeadLetterJob[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load DLQ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDLQ();
    const interval = setInterval(fetchDLQ, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRequeue = async (item: DeadLetterJob) => {
    try {
      await supabase.rpc('requeue_from_dlq', { p_dlq_id: item.id });
      fetchDLQ();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to requeue');
    }
  };

  const handleDelete = async (item: DeadLetterJob) => {
    if (!confirm('Permanently delete this dead-letter entry?')) return;
    try {
      const { error } = await supabase.from('dead_letter_queue').delete().eq('id', item.id);
      if (error) throw error;
      fetchDLQ();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handlePurge = async () => {
    if (!confirm('Permanently delete ALL dead-letter entries? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('dead_letter_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      fetchDLQ();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to purge');
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dead Letter Queue</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Jobs that exhausted all retry attempts. Requeue or permanently delete them.
          </p>
        </div>
        {dlqJobs.length > 0 && (
          <Button variant="danger" onClick={handlePurge}>
            <Trash2 className="h-4 w-4" />
            Purge All
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {dlqJobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" />}
            title="No dead-lettered jobs"
            description="When jobs fail all retry attempts, they land here for manual review. Everything is processing cleanly."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {dlqJobs.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      {item.attempts} attempts
                    </Badge>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.queue?.name || 'Unknown queue'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(item.moved_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-gray-500 dark:text-gray-400">Reason:</span>{' '}
                    {item.reason}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    {JSON.stringify(item.payload, null, 2)}
                  </pre>
                </div>
                <div className="ml-4 flex flex-col gap-2">
                  <Button variant="secondary" size="sm" onClick={() => handleRequeue(item)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Requeue
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(item)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
