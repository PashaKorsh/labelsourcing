import { useState } from 'react';
import styles from './RawSettingsEditor.module.css';

interface Props {
  onChange: (value: Record<string, unknown>) => void;
}

export function RawSettingsEditor({ onChange }: Props) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleChange = (text: string) => {
    setRaw(text);
    if (!text.trim()) {
      setError(null);
      onChange({});
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        setError('Ожидается JSON-объект');
        return;
      }
      setError(null);
      onChange(parsed as Record<string, unknown>);
    } catch (e) {
      setError((e as SyntaxError).message);
    }
  };

  return (
    <div className={styles.root}>
      <label className={styles.label}>JSON</label>
      <p className={styles.hint}>
        Поля из этого редактора будут отправлены вместе с остальными настройками.
        Явные поля выше имеют приоритет над одноимёнными ключами здесь.
      </p>
      <textarea
        className={`${styles.textarea}${error ? ` ${styles.hasError}` : ''}`}
        value={raw}
        onChange={e => handleChange(e.target.value)}
        placeholder={'{\n  "key": "value"\n}'}
        rows={6}
        spellCheck={false}
      />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
