import React, { useEffect, useRef } from 'react';
import styles from './AuthPage.module.css';
import type { AppMode } from '../../types/appMode';
import { ModeSwitcher } from '../../components/ModeSwitcher';

const CONTAINER_ID = 'yandex-passport-button';

export interface AuthPageProps {
  onModeChange: (mode: AppMode) => void;
}

export function AuthPage({ onModeChange }: AuthPageProps) {
  const isInitialized = useRef(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js';

    script.onload = () => {
      if (!window.YaAuthSuggest || isInitialized.current) return;
      isInitialized.current = true;

      window.YaAuthSuggest.init(
        {
          client_id: '347188b760b2420baacfa596cbc8ce57',
          response_type: 'token',
          redirect_uri: `${window.location.origin}/suggest/token.html`,
        },
        window.location.origin,
        {
          view: 'button',
          parentId: CONTAINER_ID,
          buttonView: 'main',
          buttonTheme: 'light',
          buttonSize: 'm',
          buttonBorderRadius: 8,
        }
      )
        .then((result) => result.handler())
        .then((data) => {
          console.log('Токен от Яндекса получен');
          // TODO: отправить data.access_token на бэкенд для валидации
        })
        .catch((error: unknown) => {
          console.error('Ошибка входа через Яндекс:', error);
        });
    };

    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
      isInitialized.current = false;
      const container = document.getElementById(CONTAINER_ID);
      if (container) container.innerHTML = '';
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Добро пожаловать</h1>
        <p className={styles.subtitle}>Войдите, чтобы начать разметку</p>
        <div id={CONTAINER_ID} className={styles.yandexButton} />
      </div>
      <ModeSwitcher currentMode='auth' onModeChange={onModeChange} />
    </div>
  );
}