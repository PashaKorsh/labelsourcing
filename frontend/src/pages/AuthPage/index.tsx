import { useEffect } from 'react';
import styles from './AuthPage.module.css';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { API, apiFetch } from '../../config/api';
import { ROUTES } from '../../config/routes';

export function AuthPage() {
  useEffect(() => {
    // Если кука сессии уже есть — пользователь авторизован.
    // TODO: перенаправить на страницу выбора датасета после её реализации.
    apiFetch(API.users.me()).catch(() => { /* не авторизован — остаёмся на странице входа */ });
  }, []);

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
