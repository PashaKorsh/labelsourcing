import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthPage.module.css';
import type { AppMode } from '../../types/appMode';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { API } from '../../config/api';

export interface AuthPageProps {
  onModeChange: (mode: AppMode) => void;
}

export function AuthPage({ onModeChange }: AuthPageProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('access_token', token);
      window.history.replaceState({}, '', '/login');
      navigate('/');
    }
  }, [navigate]);

  const handleLogin = () => {
    const params = new URLSearchParams({
      success_url: `${window.location.origin}/login`,
      error_url: `${window.location.origin}/login`,
    });
    window.location.href = `${API.auth.yandexLogin()}?${params}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Добро пожаловать</h1>
        <p className={styles.subtitle}>Войдите, чтобы начать разметку</p>
        <button onClick={handleLogin} className={styles.yandexButton}>
          Войти через Яндекс
        </button>
      </div>
      <ModeSwitcher currentMode='auth' onModeChange={onModeChange} />
    </div>
  );
}