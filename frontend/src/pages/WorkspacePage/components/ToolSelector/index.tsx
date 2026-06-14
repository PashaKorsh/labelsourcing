import type { DrawingToolDef } from '@/types/tools';
import styles from './ToolSelector.module.css';

interface Props {
  tools: DrawingToolDef[];
  activeTool: string;
  onSelect: (toolId: string) => void;
}

export function ToolSelector({ tools, activeTool, onSelect }: Props) {
  return (
    <div className={styles.container}>
      {tools.map(tool => (
        <button
          key={tool.id}
          className={`${styles.button} ${activeTool === tool.id ? styles.active : ''}`}
          onClick={() => onSelect(tool.id)}
          title={tool.hotkey ? `${tool.label}  [${tool.hotkey.toUpperCase()}]` : tool.label}
          aria-label={tool.label}
        >
          <span className={styles.icon}>{tool.icon}</span>
        </button>
      ))}
    </div>
  );
}
