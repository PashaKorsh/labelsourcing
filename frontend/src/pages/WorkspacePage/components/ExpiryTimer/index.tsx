import { useState, useEffect } from 'react';
import { toUTC } from '@/utils/time';
import styles from './ExpiryTimer.module.css';

function formatTimeLeft(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  expiresAt: string;
}

export function ExpiryTimer({ expiresAt }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(toUTC(expiresAt)).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.floor((new Date(toUTC(expiresAt)).getTime() - Date.now()) / 1000)));
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(toUTC(expiresAt)).getTime() - Date.now()) / 1000)));
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
