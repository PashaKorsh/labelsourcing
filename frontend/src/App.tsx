import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { WorkspacePage } from './pages/WorkspacePage';
import { ValidationPage } from './pages/ValidationPage';
import { AuthPage } from './pages/AuthPage';
import type { AppMode } from './types/appMode';
import styles from './App.module.css';

function MainPage() {
  const [mode, setMode] = useState<Exclude<AppMode, 'auth'>>('annotation');
  const navigate = useNavigate();
  const CurrentPage = mode === 'annotation' ? WorkspacePage : ValidationPage;

  const handleModeChange = (newMode: AppMode) => {
    if (newMode === 'auth') {
      navigate('/login');
    } else {
      setMode(newMode);
    }
  };

  return (
    <div className={styles.root}>
      <CurrentPage onModeChange={handleModeChange} />
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  return (
    <div className={styles.root}>
      <AuthPage onModeChange={(mode) => mode !== 'auth' && navigate('/')} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<MainPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
