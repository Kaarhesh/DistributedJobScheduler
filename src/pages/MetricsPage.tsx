import { useEffect, useState } from 'react';
import { Activity, TrendingUp, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, Spinner, Select } from '../components/ui';
import { formatDuration, formatNumber, classNames } from '../lib/utils';
import type { QueueWithStats } from '../lib/types';

interface TimeSeriesPoint {
  time: string;
  completed: number;
  failed: number;
}

export function MetricsPage() {
  const [queues, setQueues] = useState<QueueWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQueue, setSelectedQueue] = useState('all');
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);

  const fetchMetrics = async () => {
    try {
      const { data, error } = await supabase
        .from('queues')
        .select('*, retry_policies(*), queue_stats(*)')
        .order('name');

      if (error) throw error;
      setQueues((data || []) as QueueWithStats[]);

      const now = new Date();
      const points: TimeSeriesPoint[] = [];
      for (let i = 11; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 5 * 60 * 1000);
        let query = supabase
          .from('jobs')
          .select('status')
          .gte('finished_at', time.toISOString())
          .lt('finished_at', new Date(time.getTime() + 5 * 60 * 1000).toISOString());

        if (selectedQueue !== 'all') {
          query = query.eq('queue_id', selectedQueue);
        }

        const { data: jobs } = await query;
        const completed = (jobs || []).filter((j) => j.status === 'completed').length;
        const failed = (jobs || []).filter((j) => j.status === 'failed').length;
        points.push({
          time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          completed,
          failed,
        });
      }
      setTimeSeries(points);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, [selectedQueue]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const allStats = queues.reduce(
    (acc, q) => {
      const qs = q.queue_stats;
      if (qs) {
        acc.totalJobs += qs.total_jobs;
        acc.queued += qs.queued;
        acc.running += qs.running;
        acc.completed += qs.completed;
        acc.failed += qs.failed;
        acc.deadLettered += qs.dead_lettered;
        acc.avgDurationMs += Number(qs.avg_duration_ms);
        acc.throughputPerMin += Number(qs.throughput_per_min);
      }
      return acc;
    },
    {
      totalJobs: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      deadLettered: 0,
      avgDurationMs: 0,
      throughputPerMin: 0,
    }
  );

  if (queues.length > 0) {
    allStats.avgDurationMs = allStats.avgDurationMs / queues.length;
  }

  const successRate =
    allStats.completed + allStats.failed > 0
      ? (allStats.completed / (allStats.completed + allStats.failed)) * 100
      : 0;

  const maxTsValue = Math.max(
    1,
    ...timeSeries.map((p) => Math.max(p.completed, p.failed))
  );

  const metricCards = [
    {
      label: 'Total Jobs Processed',
      value: formatNumber(allStats.totalJobs),
      icon: Activity,
      color: 'blue',
    },
    {
      label: 'Throughput (jobs/min)',
      value: formatNumber(Math.round(allStats.throughputPerMin)),
      icon: TrendingUp,
      color: 'cyan',
    },
    {
      label: 'Avg Duration',
      value: formatDuration(allStats.avgDurationMs),
      icon: Clock,
      color: 'purple',
    },
    {
      label: 'Success Rate',
      value: `${successRate.toFixed(1)}%`,
      icon: CheckCircle2,
      color: 'emerald',
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Metrics</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Performance and throughput analytics
          </p>
        </div>
        <Select
          value={selectedQueue}
          onChange={setSelectedQueue}
          options={[
            { value: 'all', label: 'All queues' },
            ...queues.map((q) => ({ value: q.id, label: q.name })),
          ]}
          className="w-48"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {card.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                    {card.value}
                  </p>
                </div>
                <div className={classNames('flex h-10 w-10 items-center justify-center rounded-lg', colorMap[card.color])}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
          Job Throughput (last 60 minutes)
        </h2>
        <div className="flex h-48 items-end gap-1">
          {timeSeries.map((point, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end gap-0.5">
                <div
                  className="flex-1 rounded-t bg-emerald-500 transition-all hover:bg-emerald-600 dark:bg-emerald-400 dark:hover:bg-emerald-300"
                  style={{ height: `${(point.completed / maxTsValue) * 100}%` }}
                  title={`${point.completed} completed`}
                />
                <div
                  className="flex-1 rounded-t bg-red-500 transition-all hover:bg-red-600 dark:bg-red-400 dark:hover:bg-red-300"
                  style={{ height: `${(point.failed / maxTsValue) * 100}%` }}
                  title={`${point.failed} failed`}
                />
              </div>
              <span className="text-[10px] text-gray-400">{point.time}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-emerald-500 dark:bg-emerald-400" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-500 dark:bg-red-400" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Failed</span>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
          Per-Queue Breakdown
        </h2>
        {queues.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No queues to display.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Queue</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Total</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Queued</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Running</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Completed</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Failed</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">DLQ</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Avg Duration</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Throughput/min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {queues.map((q) => {
                  const qs = q.queue_stats;
                  return (
                    <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-white">
                        {q.name}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400">
                        {qs?.total_jobs ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-blue-600 dark:text-blue-400">
                        {qs?.queued ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-orange-600 dark:text-orange-400">
                        {qs?.running ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-emerald-600 dark:text-emerald-400">
                        {qs?.completed ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-red-600 dark:text-red-400">
                        {qs?.failed ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400">
                        {qs?.dead_lettered ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400">
                        {formatDuration(Number(qs?.avg_duration_ms ?? 0))}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400">
                        {formatNumber(Math.round(Number(qs?.throughput_per_min ?? 0)))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Queued</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{allStats.queued}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Running</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{allStats.running}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Failed</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{allStats.failed}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
