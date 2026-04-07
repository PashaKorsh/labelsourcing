import { useState } from 'react';
import { WorkspacePage } from './pages/WorkspacePage';
import { ValidationPage } from './pages/ValidationPage';
import type { AppMode } from './types/appMode';
import styles from './App.module.css';

export default function App() {
  const [mode, setMode] = useState<AppMode>('annotation');

  return (
    <div className={styles.root}>
      {mode === 'annotation'
        ? <WorkspacePage onModeChange={setMode} />
        : <ValidationPage onModeChange={setMode} />
      }
    </div>
  );
}
