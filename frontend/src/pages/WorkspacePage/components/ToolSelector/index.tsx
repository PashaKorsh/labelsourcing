import type { DrawingToolDef } from '../../../../types/tools';
import styles from './ToolSelector.module.css';

interface Props {
  tools: DrawingToolDef[];
  activeTool: string;
  onSelect: (toolId: string) => void;
}

export function ToolSelector({ tools, activeTool, onSelect }: Props) {
  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Tools</h3>
      <ul className={styles.list}>
        {tools.map(tool => (
          <li key={tool.id}>
            <button
              className={`${styles.button} ${activeTool === tool.id ? styles.active : ''}`}
              onClick={() => onSelect(tool.id)}
              title={tool.hotkey ? `${tool.label}  [${tool.hotkey.toUpperCase()}]` : tool.label}
            >
              <span className={styles.icon}>{tool.icon}</span>
              {tool.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
