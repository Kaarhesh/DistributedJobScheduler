import { type ReactNode } from 'react';
import {
  LayoutDashboard,
  ListOrdered,
  Briefcase,
  HardDrive,
  AlertTriangle,
  Calendar,
  Activity,
  Moon,
  Sun,
  Github,
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import { classNames } from '../lib/utils';

export type PageId =
  | 'dashboard'
  | 'queues'
  | 'jobs'
  | 'workers'
  | 'dlq'
  | 'scheduled'
  | 'metrics';

interface SidebarProps {
  current: PageId;
  onNavigate: (page: PageId) => void;
}

const NAV_ITEMS: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'queues', label: 'Queues', icon: ListOrdered },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'workers', label: 'Workers', icon: HardDrive },
  { id: 'scheduled', label: 'Scheduled', icon: Calendar },
  { id: 'dlq', label: 'Dead Letter', icon: AlertTriangle },
  { id: 'metrics', label: 'Metrics', icon: Activity },
];

export function Sidebar({ current, onNavigate }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-900 dark:text-white">JobFlow</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Distributed Scheduler</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={classNames(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50'
              )}
            >
              <Icon className={classNames('h-4 w-4', isActive ? '' : 'text-gray-400 dark:text-gray-500')} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-3 dark:border-gray-700">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50"
        >
          <Github className="h-4 w-4" />
          GitHub
        </a>
      </div>
    </aside>
  );
}

interface LayoutProps {
  children: ReactNode;
  current: PageId;
  onNavigate: (page: PageId) => void;
}

export function Layout({ children, current, onNavigate }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar current={current} onNavigate={onNavigate} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
