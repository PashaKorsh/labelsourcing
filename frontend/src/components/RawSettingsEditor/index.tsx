import { useState, useEffect, useRef } from 'react';
import styles from './RawSettingsEditor.module.css';

interface Props {
  value?: Record<string, unknown> | null;
  onChange: (value: Record<string, unknown> | null) => void;
  hint?: string;
}

export function RawSettingsEditor({ value, onChange, hint }: Props) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isFocusedRef = useRef(false);

  // Синхронизируем raw с внешним value, пока пользователь не редактирует textarea.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setRaw(value && Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : '');
      setError(null);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (text: string) => {
    setRaw(text);
    if (!text.trim()) {
      setError(null);
      onChange(null);
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
      {hint && <p className={styles.hint}>{hint}</p>}
      <textarea
        className={`${styles.textarea}${error ? ` ${styles.hasError}` : ''}`}
        value={raw}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { isFocusedRef.current = true; }}
        onBlur={() => { isFocusedRef.current = false; }}
        placeholder={'{\n  "key": "value"\n}'}
        rows={6}
        spellCheck={false}
      />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
