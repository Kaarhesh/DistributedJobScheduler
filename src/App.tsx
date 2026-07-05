import { useState } from 'react';
import { ThemeProvider } from './lib/theme';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout, type PageId } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { QueuesPage } from './pages/QueuesPage';
import { JobsPage } from './pages/JobsPage';
import { WorkersPage } from './pages/WorkersPage';
import { DeadLetterPage } from './pages/DeadLetterPage';
import { ScheduledPage } from './pages/ScheduledPage';
import { MetricsPage } from './pages/MetricsPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { Spinner } from './components/ui';

type AuthView = 'login' | 'signup';

function AppContent() {
  const { session, loading } = useAuth();
  const [page, setPage] = useState<PageId>('dashboard');
  const [authView, setAuthView] = useState<AuthView>('login');

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!session) {
    if (authView === 'signup') {
      return <SignupPage onNavigateLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onNavigateSignup={() => setAuthView('signup')} />;
  }

  return (
    <Layout current={page} onNavigate={setPage}>
      {page === 'dashboard' && <DashboardPage onNavigate={setPage} />}
      {page === 'queues' && <QueuesPage />}
      {page === 'jobs' && <JobsPage />}
      {page === 'workers' && <WorkersPage />}
      {page === 'dlq' && <DeadLetterPage />}
      {page === 'scheduled' && <ScheduledPage />}
      {page === 'metrics' && <MetricsPage />}
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
