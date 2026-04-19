import { useState } from 'react';
import { WorkspacePage } from './pages/WorkspacePage';
import { ValidationPage } from './pages/ValidationPage';
import type { AppMode } from './types/appMode';
import styles from './App.module.css';
import { AuthPage } from './pages/AuthPage';

const PAGES: Record<AppMode, React.ComponentType<{ onModeChange: (mode: AppMode) => void }>> = {
  annotation: WorkspacePage,
  validation: ValidationPage,
  auth: AuthPage,
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('annotation');
  const CurrentPage = PAGES[mode] || WorkspacePage;

  return (
    <div className={styles.root}>
      <CurrentPage onModeChange={setMode} />
    </div>
  );
}