import { getHints } from '../../../../tools/toolHints';
import styles from './HintsBar.module.css';

interface HintsBarProps {
  activeTool: string;
}

export function HintsBar({ activeTool }: HintsBarProps) {
  const hints = getHints(activeTool);
  if (hints.length === 0) return null;

  return (
    <div className={styles.bar}>
      {hints.map(h => (
        <span key={h.key} className={styles.hint}>
          <kbd className={styles.key}>{h.key}</kbd>
          <span className={styles.desc}>{h.description}</span>
        </span>
      ))}
    </div>
  );
}
