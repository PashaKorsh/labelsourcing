import { ContextMenu } from './components/ContextMenu';
import { RoleBadge } from '@/components/RoleBadge';
import { AppTagPicker } from './components/AppTagPicker';
import type { AppTag } from '@/types/appTag';
import styles from './AppTagSelector.module.css';

interface Props {
  selectedTags: AppTag[];
  onTagsChange: (tags: AppTag[]) => void;
}

export function AppTagSelector({ selectedTags, onTagsChange }: Props) {
  const handleToggle = (tag: AppTag) => {
    const isSelected = selectedTags.some(t => t.id === tag.id);
    onTagsChange(
      isSelected
        ? selectedTags.filter(t => t.id !== tag.id)
        : [...selectedTags, tag],
    );
  };

  return (
    <div className={styles.container}>
      {selectedTags.map(tag => (
        <RoleBadge key={tag.id} role={tag} />
      ))}
      <ContextMenu
        centered
        trigger={<button type="button" className={styles.addButton}>+</button>}
      >
        <AppTagPicker selectedTags={selectedTags} onToggle={handleToggle} />
      </ContextMenu>
    </div>
  );
}
