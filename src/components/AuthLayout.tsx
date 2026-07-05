import { useState, type ReactNode } from 'react';
import { Activity, AlertCircle } from 'lucide-react';
import { Spinner } from './ui';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50/30 to-cyan-50/20 px-4 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/30">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20">
            <Activity className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">JobFlow</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Distributed Job Scheduler</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/20">
          <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          {children}
        </div>

        <div className="mt-6 text-center">{footer}</div>
      </div>
    </div>
  );
}

interface AuthFieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  autoComplete?: string;
}

export function AuthField({ label, type, value, onChange, placeholder, required, autoComplete }: AuthFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
      />
    </label>
  );
}

interface AuthErrorProps {
  message: string;
}

export function AuthError({ message }: AuthErrorProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

interface AuthSubmitButtonProps {
  loading: boolean;
  children: ReactNode;
}

export function AuthSubmitButton({ loading, children }: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/40 focus:outline-none disabled:cursor-not-allowed disabled:bg-blue-400"
    >
      {loading && <Spinner size="sm" className="text-white" />}
      {children}
    </button>
  );
}

export function useAuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return { email, setEmail, password, setPassword, error, setError, loading, setLoading };
}
