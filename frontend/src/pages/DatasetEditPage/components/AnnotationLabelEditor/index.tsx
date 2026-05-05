import type { Tag } from '../../../../types/annotation';
import styles from './AnnotationLabelEditor.module.css';

interface Props {
  labels: Tag[];
  onChange: (labels: Tag[]) => void;
}

export function AnnotationLabelEditor({ labels, onChange }: Props) {
  const handleChange = (index: number, field: keyof Tag, value: string) => {
    onChange(labels.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const addLabel = () => {
    onChange([
      ...labels,
      { id: crypto.randomUUID(), label: '', color: '#3b82f6' },
    ]);
  };

  const removeLabel = (index: number) => {
    onChange(labels.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.container}>
      {labels.map((label, i) => (
        <div key={label.id} className={styles.row}>
          <input
            type="color"
            className={styles.colorPicker}
            value={label.color}
            onChange={e => handleChange(i, 'color', e.target.value)}
            title="Цвет метки"
          />
          <input
            type="text"
            className={styles.nameInput}
            placeholder="Название метки"
            value={label.label}
            onChange={e => handleChange(i, 'label', e.target.value)}
          />
          <button
            type="button"
            className={styles.removeButton}
            onClick={() => removeLabel(i)}
            title="Удалить"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className={styles.addButton} onClick={addLabel}>
        + Добавить метку
      </button>
    </div>
  );
}
