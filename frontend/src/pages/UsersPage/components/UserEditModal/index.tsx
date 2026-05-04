import { useState } from 'react';
import { AppTagSelector } from '../../../../components/AppTagSelector';
import { userService } from '../../../../services';
import type { AppTag } from '../../../../types/appTag';
import type { UserListItem } from '../../../../types/user';
import styles from './UserEditModal.module.css';

interface Props {
  user: UserListItem;
  onClose: () => void;
  onSave: (updated: UserListItem) => void;
}

export function UserEditModal({ user, onClose, onSave }: Props) {
  const [tags, setTags] = useState<AppTag[]>(user.tags);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await userService.update(user.id, { tagIds: tags.map(t => t.id) });
      onSave(updated);
    } catch (err) {
      console.error('[UserEditModal]', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className={styles.avatar} />
          )}
          <div className={styles.userInfo}>
            <p className={styles.name}>{user.name ?? user.email}</p>
            <p className={styles.email}>{user.email}</p>
          </div>
        </div>

        <div className={styles.field}>
          <p className={styles.fieldLabel}>Теги</p>
          <AppTagSelector selectedTags={tags} onTagsChange={setTags} />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
