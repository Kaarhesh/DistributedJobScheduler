export type JobType = 'immediate' | 'delayed' | 'scheduled' | 'recurring' | 'batch';
export type JobStatus = 'queued' | 'scheduled' | 'claimed' | 'running' | 'completed' | 'failed' | 'retry' | 'dead';
export type WorkerStatus = 'active' | 'draining' | 'dead';
export type RetryStrategy = 'fixed' | 'linear' | 'exponential';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ExecutionStatus = 'success' | 'failed' | 'running';

export interface Queue {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  concurrency_limit: number;
  is_paused: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RetryPolicy {
  id: string;
  queue_id: string;
  strategy: RetryStrategy;
  max_attempts: number;
  base_delay_ms: number;
  max_delay_ms: number;
  created_at: string;
}

export interface QueueStats {
  id: string;
  queue_id: string;
  total_jobs: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  dead_lettered: number;
  avg_duration_ms: number;
  throughput_per_min: number;
  updated_at: string;
}

export interface QueueWithStats extends Queue {
  retry_policies?: RetryPolicy | null;
  queue_stats?: QueueStats | null;
}

export interface Job {
  id: string;
  queue_id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  worker_id: string | null;
  run_at: string;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface JobWithRelations extends Job {
  queue?: Pick<Queue, 'id' | 'name'> | null;
  worker?: Pick<Worker, 'id' | 'name'> | null;
}

export interface JobExecution {
  id: string;
  job_id: string;
  worker_id: string | null;
  attempt_number: number;
  status: ExecutionStatus;
  duration_ms: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface JobLog {
  id: string;
  job_id: string;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Worker {
  id: string;
  name: string;
  hostname: string;
  concurrency: number;
  status: WorkerStatus;
  registered_at: string;
  last_seen_at: string;
}

export interface WorkerHeartbeat {
  id: string;
  worker_id: string;
  active_jobs: number;
  cpu_percent: number;
  memory_mb: number;
  created_at: string;
}

export interface ScheduledJob {
  id: string;
  job_id: string;
  cron_expr: string | null;
  next_run_at: string;
  last_run_at: string | null;
  is_active: boolean;
}

export interface DeadLetterJob {
  id: string;
  job_id: string;
  queue_id: string;
  reason: string;
  payload: Record<string, unknown>;
  attempts: number;
  moved_at: string;
  queue?: Pick<Queue, 'id' | 'name'> | null;
  job?: Pick<Job, 'id' | 'type' | 'priority'> | null;
}

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  queued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  claimed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  running: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  retry: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  dead: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export const JOB_STATUS_DOT_COLORS: Record<JobStatus, string> = {
  queued: 'bg-blue-500',
  scheduled: 'bg-purple-500',
  claimed: 'bg-amber-500',
  running: 'bg-orange-500',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  retry: 'bg-yellow-500',
  dead: 'bg-gray-500',
};

export const WORKER_STATUS_COLORS: Record<WorkerStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  draining: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  dead: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-gray-500 dark:text-gray-400',
  info: 'text-blue-600 dark:text-blue-400',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};
