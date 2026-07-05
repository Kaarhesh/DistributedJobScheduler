import { useAuth } from '../lib/auth';
import { AuthLayout, AuthField, AuthError, AuthSubmitButton, useAuthForm } from '../components/AuthLayout';

interface LoginPageProps {
  onNavigateSignup: () => void;
}

export function LoginPage({ onNavigateSignup }: LoginPageProps) {
  const { signIn } = useAuth();
  const { email, setEmail, password, setPassword, error, setError, loading, setLoading } = useAuthForm();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your account to continue"
      footer={
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Don't have an account?{' '}
          <button
            onClick={onNavigateSignup}
            className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Sign up
          </button>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <AuthError message={error} />}
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
        <AuthField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
        <AuthSubmitButton loading={loading}>Sign In</AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}
