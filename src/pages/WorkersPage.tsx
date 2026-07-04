import { useEffect, useState } from 'react';
import { HardDrive, Activity, Clock, Cpu, MemoryStick } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, Badge, EmptyState, Spinner } from '../components/ui';
import { formatRelativeTime, classNames } from '../lib/utils';
import type { Worker, WorkerHeartbeat, WorkerStatus } from '../lib/types';
import { WORKER_STATUS_COLORS } from '../lib/types';

export function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [heartbeats, setHeartbeats] = useState<Record<string, WorkerHeartbeat[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: workersData, error: wErr } = await supabase
          .from('workers')
          .select('*')
          .order('last_seen_at', { ascending: false });

        if (wErr) throw wErr;
        const workersList = (workersData || []) as Worker[];
        setWorkers(workersList);

        if (workersList.length > 0) {
          const hbPromises = workersList.map((w) =>
            supabase
              .from('worker_heartbeats')
              .select('*')
              .eq('worker_id', w.id)
              .order('created_at', { ascending: false })
              .limit(20)
          );
          const hbResults = await Promise.all(hbPromises);
          const hbMap: Record<string, WorkerHeartbeat[]> = {};
          workersList.forEach((w, i) => {
            hbMap[w.id] = (hbResults[i].data || []) as WorkerHeartbeat[];
          });
          setHeartbeats(hbMap);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workers');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const activeCount = workers.filter((w) => w.status === 'active').length;
  const drainingCount = workers.filter((w) => w.status === 'draining').length;
  const deadCount = workers.filter((w) => w.status === 'dead').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workers</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Monitor worker processes and their health
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{activeCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Draining</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{drainingCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Dead</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{deadCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {workers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HardDrive className="h-6 w-6" />}
            title="No workers registered"
            description="Workers will appear here when they connect to the scheduler. Run a worker tick from the dashboard to simulate worker activity."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {workers.map((w) => {
            const hbs = heartbeats[w.id] || [];
            const latestHb = hbs[0];
            return (
              <Card key={w.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={classNames(
                        'flex h-10 w-10 items-center justify-center rounded-lg',
                        w.status === 'active'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : w.status === 'draining'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                      )}
                    >
                      <HardDrive className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {w.name}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {w.hostname} · Concurrency {w.concurrency}
                      </p>
                    </div>
                  </div>
                  <Badge className={WORKER_STATUS_COLORS[w.status as WorkerStatus]}>
                    {w.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Registered</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                      {formatRelativeTime(w.registered_at)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Last Seen</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                      {formatRelativeTime(w.last_seen_at)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Active Jobs</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                      {latestHb?.active_jobs ?? '—'}
                    </p>
                  </div>
                </div>

                {latestHb && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
                      <Cpu className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">CPU</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {latestHb.cpu_percent}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
                      <MemoryStick className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Memory</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {latestHb.memory_mb} MB
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {hbs.length > 1 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                      Heartbeat History
                    </p>
                    <div className="flex h-12 items-end gap-1">
                      {hbs.slice(0, 20).reverse().map((hb) => (
                        <div
                          key={hb.id}
                          className="flex-1 rounded-t bg-blue-500/60 dark:bg-blue-400/60"
                          style={{ height: `${Math.max(10, (hb.active_jobs / w.concurrency) * 100)}%` }}
                          title={`${hb.active_jobs} active jobs`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
