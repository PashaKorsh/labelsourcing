import { useState, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import { tagService } from '../../services';
import type { AppTag } from '../../types/appTag';
import styles from './TagsPage.module.css';

export function TagsPage() {
  const [tags, setTags] = useState<AppTag[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6b7280');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    tagService.list().then(setTags).catch(console.error);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await tagService.create({ name: newName.trim(), color: newColor });
      setTags(prev => [...prev, created]);
      setNewName('');
      setNewColor('#6b7280');
    } catch (err) {
      console.error('[TagsPage] create:', err);
    }
  };

  const startEdit = (tag: AppTag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color ?? '#6b7280');
  };

  const handleUpdate = async (id: string) => {
    try {
      const updated = await tagService.update(id, { name: editName.trim(), color: editColor });
      setTags(prev => prev.map(t => t.id === id ? updated : t));
      setEditingId(null);
    } catch (err) {
      console.error('[TagsPage] update:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tagService.delete(id);
      setTags(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('[TagsPage] delete:', err);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />

        <section className={styles.list}>
          {tags.map((tag) => (
            <div key={tag.id} className={styles.row}>
              {editingId === tag.id ? (
                <>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={editColor}
                    onChange={e => setEditColor(e.target.value)}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                  <div className={styles.spacer} />
                  <button type="button" className={styles.editButton} onClick={() => handleUpdate(tag.id)}>
                    Сохранить
                  </button>
                  <button type="button" className={styles.deleteButton} onClick={() => setEditingId(null)}>
                    Отмена
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.colorSwatch} style={{ backgroundColor: tag.color ?? '#d9d9d9' }} />
                  <RoleBadge role={tag} />
                  <span className={styles.colorCode}>{tag.color ?? '—'}</span>
                  <div className={styles.spacer} />
                  <button type="button" className={styles.editButton} onClick={() => startEdit(tag)}>
                    Редактировать
                  </button>
                  <button type="button" className={styles.deleteButton} onClick={() => handleDelete(tag.id)}>
                    Удалить
                  </button>
                </>
              )}
            </div>
          ))}
        </section>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Новый тег</h2>
          <div className={styles.createForm}>
            <input
              type="text"
              className={styles.input}
              placeholder="Название тега"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <input
              type="color"
              className={styles.colorPicker}
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
            />
            <button type="button" className={styles.createButton} onClick={handleCreate}>
              Создать
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
