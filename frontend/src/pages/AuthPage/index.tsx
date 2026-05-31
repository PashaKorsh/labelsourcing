import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthPage.module.css';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { API } from '../../config/api';
import { ROUTES } from '../../config/routes';
import { useAuth } from '../../context/auth';

const DEV_USERS = [
  { key: 'admin',       label: 'Admin' },
  { key: 'annotator-1', label: 'Annotator 1' },
  { key: 'annotator-2', label: 'Annotator 2' },
] as const;

export function AuthPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [devError, setDevError] = useState('');

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

  const handleDevLogin = async (userKey: string) => {
    setDevError('');
    try {
      const res = await fetch(API.auth.devLogin(userKey), { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDevError(body.detail ?? `Ошибка ${res.status}`);
        return;
      }
      window.location.replace(ROUTES.home);
    } catch {
      setDevError('Нет связи с сервером');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Добро пожаловать</h1>
        <p className={styles.subtitle}>Войдите, чтобы начать разметку</p>
        <button onClick={handleLogin} className={styles.yandexButton}>
          Войти через Яндекс
        </button>

        {import.meta.env.VITE_DEV_PANEL === 'true' && (
          <div className={styles.devSection}>
            <span className={styles.devLabel}>DEV</span>
            <div className={styles.devButtons}>
              {DEV_USERS.map(u => (
                <button key={u.key} onClick={() => handleDevLogin(u.key)} className={styles.devButton}>
                  {u.label}
                </button>
              ))}
            </div>
            {devError && <p className={styles.devError}>{devError}</p>}
          </div>
        )}
      </div>
      <ModeSwitcher />
    </div>
  );
}
