import { useEffect, useState, useCallback } from 'react';
import { utilityService } from '../../services';
import type { Utility, PairingCode } from '../../types/utility';
import styles from './UtilitiesSection.module.css';

export function UtilitiesSection() {
  const [utilities, setUtilities] = useState<Utility[]>([]);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    utilityService.list().then(setUtilities).catch(() => setError('Не удалось загрузить утилиты'));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const handleGetCode = async () => {
    setLoading(true);
    setError('');
    try {
      setCode(await utilityService.createPairingCode());
    } catch {
      setError('Не удалось получить код');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await utilityService.delete(id);
    load();
  };

  return (
    <div className={styles.card}>
      <h2 className={styles.title}>Утилиты</h2>
      <p className={styles.hint}>
        Утилита раздаёт картинки с вашего компьютера на разметку без загрузки на сервер.
        Получите код и введите его в утилите командой <code>pair</code>.
      </p>

      <button type="button" className={styles.codeButton} onClick={handleGetCode} disabled={loading}>
        {loading ? 'Получение…' : 'Получить код привязки'}
      </button>

      {code && (
        <div className={styles.codeBox}>
          <span className={styles.code}>{code.code}</span>
          <button
            type="button"
            className={styles.copyButton}
            onClick={() => navigator.clipboard.writeText(code.code)}
          >
            Копировать
          </button>
          <span className={styles.expiry}>
            действует до {new Date(code.expiresAt).toLocaleTimeString()}
          </span>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {utilities.length > 0 && (
        <ul className={styles.list}>
          {utilities.map(u => (
            <li key={u.id} className={styles.item}>
              <span className={`${styles.dot} ${u.online ? styles.online : styles.offline}`} />
              <span className={styles.name}>{u.name}</span>
              {u.publicBaseUrl && <span className={styles.badge}>direct</span>}
              <span className={styles.status}>{u.online ? 'в сети' : 'не в сети'}</span>
              <button type="button" className={styles.deleteButton} onClick={() => handleDelete(u.id)} title="Отвязать">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
