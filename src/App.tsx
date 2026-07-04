import { useState } from 'react';
import { ThemeProvider } from './lib/theme';
import { Layout, type PageId } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { QueuesPage } from './pages/QueuesPage';
import { JobsPage } from './pages/JobsPage';
import { WorkersPage } from './pages/WorkersPage';
import { DeadLetterPage } from './pages/DeadLetterPage';
import { ScheduledPage } from './pages/ScheduledPage';
import { MetricsPage } from './pages/MetricsPage';

function App() {
  const [page, setPage] = useState<PageId>('dashboard');

  return (
    <ThemeProvider>
      <Layout current={page} onNavigate={setPage}>
        {page === 'dashboard' && <DashboardPage onNavigate={setPage} />}
        {page === 'queues' && <QueuesPage />}
        {page === 'jobs' && <JobsPage />}
        {page === 'workers' && <WorkersPage />}
        {page === 'dlq' && <DeadLetterPage />}
        {page === 'scheduled' && <ScheduledPage />}
        {page === 'metrics' && <MetricsPage />}
      </Layout>
    </ThemeProvider>
  );
}

export default App;
