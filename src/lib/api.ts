import { supabase, SUPABASE_URL } from './supabase';

export async function callEdgeFunction<T>(
  name: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = 'GET', body } = options;
  const url = `${SUPABASE_URL}/functions/v1/${name}`;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
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
