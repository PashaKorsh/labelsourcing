import { Play } from 'lucide-react';
import styles from './PlayButton.module.css';

export function PlayButton() {
  return (
    <button
      type="button"
      aria-label="Начать"
      className={styles.button}
    >
      <Play size={32} strokeWidth={1.5} />
    </button>
  );
}
