import { useEffect, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Zap,
  AlertTriangle,
  HardDrive,
  Play,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, Spinner, Button } from '../components/ui';
import { formatNumber, formatDuration, classNames } from '../lib/utils';
import type { QueueWithStats, Worker } from '../lib/types';
import { callEdgeFunction, type WorkerTickResult } from '../lib/api';

interface DashboardStats {
  totalQueues: number;
  totalJobs: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  deadLettered: number;
  activeWorkers: number;
  avgDurationMs: number;
  throughputPerMin: number;
}

interface DashboardProps {
  onNavigate: (page: 'dashboard' | 'queues' | 'jobs' | 'workers' | 'dlq' | 'scheduled' | 'metrics') => void;
}

export function DashboardPage({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queues, setQueues] = useState<QueueWithStats[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [tickResult, setTickResult] = useState<WorkerTickResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [queuesRes, workersRes] = await Promise.all([
        supabase
          .from('queues')
          .select('*, retry_policies(*), queue_stats(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('workers')
          .select('*')
          .order('last_seen_at', { ascending: false })
          .limit(10),
      ]);

      if (queuesRes.error) throw queuesRes.error;
      if (workersRes.error) throw workersRes.error;

      const queuesData = (queuesRes.data || []) as QueueWithStats[];
      const workersData = (workersRes.data || []) as Worker[];
      setQueues(queuesData);
      setWorkers(workersData);

      const s: DashboardStats = {
        totalQueues: queuesData.length,
        totalJobs: 0,
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        deadLettered: 0,
        activeWorkers: workersData.filter((w) => w.status === 'active').length,
        avgDurationMs: 0,
        throughputPerMin: 0,
      };

      for (const q of queuesData) {
        const qs = q.queue_stats;
        if (qs) {
          s.totalJobs += qs.total_jobs;
          s.queued += qs.queued;
          s.running += qs.running;
          s.completed += qs.completed;
          s.failed += qs.failed;
          s.deadLettered += qs.dead_lettered;
          s.avgDurationMs += Number(qs.avg_duration_ms);
          s.throughputPerMin += Number(qs.throughput_per_min);
        }
      }

      if (queuesData.length > 0) {
        s.avgDurationMs = s.avgDurationMs / queuesData.length;
      }

      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTick = async () => {
    setTicking(true);
    setError(null);
    try {
      const result = await callEdgeFunction<WorkerTickResult>('worker-tick', {
        method: 'POST',
        body: {},
      });
      setTickResult(result);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Worker tick failed');
    } finally {
      setTicking(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setError(null);
    try {
      await callEdgeFunction('seed-demo', { method: 'POST', body: {} });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Jobs',
      value: stats ? formatNumber(stats.totalJobs) : '0',
      icon: Briefcase,
      color: 'blue',
      onClick: () => onNavigate('jobs'),
    },
    {
      label: 'Queued',
      value: stats ? formatNumber(stats.queued) : '0',
      icon: Clock,
      color: 'blue',
      onClick: () => onNavigate('jobs'),
    },
    {
      label: 'Running',
      value: stats ? formatNumber(stats.running) : '0',
      icon: Zap,
      color: 'orange',
      onClick: () => onNavigate('jobs'),
    },
    {
      label: 'Completed',
      value: stats ? formatNumber(stats.completed) : '0',
      icon: CheckCircle2,
      color: 'emerald',
      onClick: () => onNavigate('jobs'),
    },
    {
      label: 'Failed',
      value: stats ? formatNumber(stats.failed) : '0',
      icon: XCircle,
      color: 'red',
      onClick: () => onNavigate('jobs'),
    },
    {
      label: 'Dead Letter',
      value: stats ? formatNumber(stats.deadLettered) : '0',
      icon: AlertTriangle,
      color: 'gray',
      onClick: () => onNavigate('dlq'),
    },
    {
      label: 'Active Workers',
      value: stats ? String(stats.activeWorkers) : '0',
      icon: HardDrive,
      color: 'cyan',
      onClick: () => onNavigate('workers'),
    },
    {
      label: 'Throughput/min',
      value: stats ? formatNumber(Math.round(stats.throughputPerMin)) : '0',
      icon: TrendingUp,
      color: 'purple',
      onClick: () => onNavigate('metrics'),
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Real-time overview of your job scheduler
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSeed} disabled={seeding} variant="secondary">
            {seeding ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </Button>
          <Button onClick={handleTick} disabled={ticking} variant="primary">
            {ticking ? <Spinner size="sm" className="text-white" /> : <Play className="h-4 w-4" />}
            {ticking ? 'Processing...' : 'Run Worker Tick'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {tickResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          Worker tick complete — Processed: {tickResult.processed}, Completed: {tickResult.completed}, Failed: {tickResult.failed}, Retried: {tickResult.retried}, Dead-lettered: {tickResult.dead_lettered}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              onClick={card.onClick}
              className="group text-left"
            >
              <Card className="p-4 transition-shadow group-hover:shadow-md">
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
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Queues Overview</h2>
            <button
              onClick={() => onNavigate('queues')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              View all →
            </button>
          </div>
          {queues.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No queues yet. Create one to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {queues.slice(0, 5).map((q) => {
                const qs = q.queue_stats;
                return (
                  <div
                    key={q.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={classNames(
                          'h-2 w-2 rounded-full',
                          q.is_paused ? 'bg-gray-400' : 'bg-emerald-500'
                        )}
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {q.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Priority {q.priority} · Concurrency {q.concurrency_limit}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <div className="text-center">
                        <p className="font-semibold text-blue-600 dark:text-blue-400">
                          {qs?.queued ?? 0}
                        </p>
                        <p className="text-gray-400">queued</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-orange-600 dark:text-orange-400">
                          {qs?.running ?? 0}
                        </p>
                        <p className="text-gray-400">running</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {qs?.completed ?? 0}
                        </p>
                        <p className="text-gray-400">done</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Workers</h2>
            <button
              onClick={() => onNavigate('workers')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              View all →
            </button>
          </div>
          {workers.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No workers registered yet.
            </p>
          ) : (
            <div className="space-y-3">
              {workers.slice(0, 5).map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={classNames(
                        'h-2 w-2 rounded-full',
                        w.status === 'active'
                          ? 'bg-emerald-500'
                          : w.status === 'draining'
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {w.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {w.hostname} · Concurrency {w.concurrency}
                      </p>
                    </div>
                  </div>
                  <span
                    className={classNames(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      w.status === 'active'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : w.status === 'draining'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    )}
                  >
                    {w.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {stats && stats.avgDurationMs > 0 && (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
            Performance Summary
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Avg Duration</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                {formatDuration(stats.avgDurationMs)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Throughput/min</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                {formatNumber(Math.round(stats.throughputPerMin))}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Success Rate</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                {stats.completed + stats.failed > 0
                  ? `${((stats.completed / (stats.completed + stats.failed)) * 100).toFixed(1)}%`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Dead Letter Rate</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                {stats.totalJobs > 0
                  ? `${((stats.deadLettered / stats.totalJobs) * 100).toFixed(1)}%`
                  : '—'}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
