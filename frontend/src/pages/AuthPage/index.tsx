import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthPage.module.css';
import type { AppMode } from '../../types/appMode';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { API, apiFetch } from '../../config/api';
import { ROUTES } from '../../config/routes';

export interface AuthPageProps {
  onModeChange: (mode: AppMode) => void;
}

export function AuthPage({ onModeChange }: AuthPageProps) {
  const navigate = useNavigate();

  useEffect(() => {
    // После OAuth-редиректа бэкенд ставит куку и возвращает на /login.
    // Проверяем сессию: если кука уже есть — пускаем в приложение.
    apiFetch(API.users.me())
      .then(() => navigate(ROUTES.home))
      .catch(() => {/* не авторизован — показываем кнопку */});
  }, [navigate]);

  const handleLogin = () => {
    const params = new URLSearchParams({
      success_url: `${window.location.origin}${ROUTES.login}`,
      error_url: `${window.location.origin}${ROUTES.login}`,
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