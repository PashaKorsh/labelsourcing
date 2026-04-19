import React, { useEffect, useRef } from 'react';
import styles from './AuthPage.module.css';
import type { AppMode } from '../../types/appMode';

export interface AuthPageProps {
  onModeChange: (mode: AppMode) => void;
}

export function AuthPage({ onModeChange }: AuthPageProps) {
  const containerId = 'yandex-passport-button';
  const isInitialized = useRef(false);

  useEffect(() => {
    if (window.YaAuthSuggest && !isInitialized.current) {
      isInitialized.current = true;

      window.YaAuthSuggest.init(
        {
          client_id: 'c46f0c53093440c39f12eff95a9f2f93',
          response_type: 'token',
          redirect_uri: 'https://examplesite.com/suggest/token',
        },
        'https://examplesite.com',
        {
          view: 'button',
          parentId: containerId,
          buttonView: 'main',
          buttonTheme: 'light',
          buttonSize: 'm',
          buttonBorderRadius: 8, // можно подправить под свой дизайн
        }
      )
      .then((result: any) => result.handler())
      .then((data: any) => {
        console.log('Успешный вход:', data);
        
        // Пример использования твоего пропса:
        // После получения токена меняем режим приложения
        // onModeChange(AppMode.AUTHORIZED); 
      })
      .catch((error: any) => {
        console.error('Ошибка Яндекса:', error);
      });
    }

    // Очистка при уходе со страницы
    return () => {
      isInitialized.current = false;
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '';
    };
  }, [onModeChange]); // Добавляем пропс в зависимости для порядка

  return (
    <div className="validation-page-container">
      <h1>Вход в систему</h1>
      
      {/* 3. Вставляем контейнер туда, где должна быть кнопка */}
      <div id={containerId} style={{ marginBottom: '20px' }} />

      {/* Твой остальной UI */}
      {/* <button onClick={() => onModeChange()}>
        Вернуться назад
      </button> */}
    </div>
  );
}