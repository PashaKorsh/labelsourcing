import { useState, useEffect, useRef } from 'react';
import styles from './ExpiryTimer.module.css';

function formatTimeLeft(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  expiresAt: string;
  onExpire?: () => void;
}

export function ExpiryTimer({ expiresAt, onExpire }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );

  // Храним коллбэк в рефе, чтобы не включать в зависимости эффекта
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));

    const id = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(id);
        onExpireRef.current?.();
      }
    }, 1000);

    return () => clearInterval(id);
  }, [expiresAt]);

  if (secondsLeft === 0) {
    return <span className={`${styles.timer} ${styles.expired}`}>Время истекло</span>;
  }

  return (
    <span className={`${styles.timer} ${secondsLeft < 300 ? styles.warning : ''}`}>
      ⏱ {formatTimeLeft(secondsLeft)}
    </span>
  );
}
