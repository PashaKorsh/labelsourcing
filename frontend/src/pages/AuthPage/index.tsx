import styles from './AuthPage.module.css';
import type { AppMode } from '../../types/appMode';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { buildYandexAuthUrl } from '../../config/oauth';

export interface AuthPageProps {
  onModeChange: (mode: AppMode) => void;
}

export function AuthPage({ onModeChange }: AuthPageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Добро пожаловать</h1>
        <p className={styles.subtitle}>Войдите, чтобы начать разметку</p>
        <a href={buildYandexAuthUrl()} className={styles.yandexButton}>
          Войти через Яндекс
        </a>
      </div>
      <ModeSwitcher currentMode='auth' onModeChange={onModeChange} />
    </div>
  );
}