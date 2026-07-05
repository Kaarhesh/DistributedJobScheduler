import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { AuthLayout, AuthField, AuthError, AuthSubmitButton, useAuthForm } from '../components/AuthLayout';

interface SignupPageProps {
  onNavigateLogin: () => void;
}

export function SignupPage({ onNavigateLogin }: SignupPageProps) {
  const { signUp } = useAuth();
  const { email, setEmail, password, setPassword, error, setError, loading, setLoading } = useAuthForm();
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Get started with your distributed job scheduler"
      footer={
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <button
            onClick={onNavigateLogin}
            className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Sign in
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
          placeholder="At least 6 characters"
          required
          autoComplete="new-password"
        />
        <AuthField
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Re-enter your password"
          required
          autoComplete="new-password"
        />
        <AuthSubmitButton loading={loading}>Create Account</AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}
