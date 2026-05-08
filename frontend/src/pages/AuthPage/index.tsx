import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthPage.module.css';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { API } from '../../config/api';
import { ROUTES } from '../../config/routes';
import { useAuth } from '../../context/auth';

export function AuthPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate(ROUTES.home, { replace: true });
    }
  }, [user, isLoading, navigate]);

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
