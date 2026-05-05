import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthPage.module.css';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { API, apiFetch } from '../../config/api';
import { ROUTES } from '../../config/routes';

export function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch(API.users.me())
      .then(() => navigate(ROUTES.home, { replace: true }))
      .catch(() => { /* не авторизован, значит показываем кнопку */ });
  }, [navigate]);

  const handleLogin = () => {
    const params = new URLSearchParams({
      success_url: `${window.location.origin}${ROUTES.login}`,
      error_url:   `${window.location.origin}${ROUTES.login}`,
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
      <ModeSwitcher />
    </div>
  );
}
