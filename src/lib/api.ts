import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

const headers = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export async function callEdgeFunction<T>(
  name: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = 'GET', body } = options;
  const url = `${SUPABASE_URL}/functions/v1/${name}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Edge function ${name} failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

export interface WorkerTickResult {
  processed: number;
  claimed: number;
  completed: number;
  failed: number;
  retried: number;
  dead_lettered: number;
  refreshed_stats: boolean;
}
