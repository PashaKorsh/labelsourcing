import styles from './ModeSwitcher.module.css';

export type AppMode = 'auth' | 'annotation' | 'validation';

interface ModeSwitcherProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const MODES: { id: AppMode; label: string }[] = [
  { id: 'auth', label: 'вход' },
  { id: 'annotation', label: 'Аннотирование' },
  { id: 'validation', label: 'Валидация' },
];

export function ModeSwitcher({ currentMode, onModeChange }: ModeSwitcherProps) {
  return (
    <div className={styles.modeSwitcher}>
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          className={styles.modeButton}
          // Если режим совпадает с текущим — ставим флаг активен
          data-active={currentMode === id ? "true" : undefined}
          // Кликая на другую кнопку, вызываем смену режима
          onClick={() => currentMode !== id && onModeChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}