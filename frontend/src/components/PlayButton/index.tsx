import { Play } from 'lucide-react';
import styles from './PlayButton.module.css';

interface Props {
  onClick?: () => void;
}

export function PlayButton({ onClick }: Props) {
  return (
    <button
      type="button"
      aria-label="Начать"
      className={styles.button}
      onClick={onClick}
    >
      <Play size={32} strokeWidth={1.5} />
    </button>
  );
}
