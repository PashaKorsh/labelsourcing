import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { SearchBar } from '@/components/SearchBar';
import { RoleBadge } from '@/components/RoleBadge';
import { TagFilter } from './components/TagFilter';
import { tagService } from '@/services';
import type { AppTag } from '@/types/appTag';
import styles from './TagsPage.module.css';

export function TagsPage() {
  const [tags, setTags] = useState<AppTag[]>([]);
  const [search, setSearch] = useState('');
  const [filterColors, setFilterColors] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6b7280');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      tagService.list({ search: search || undefined }).then(setTags).catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

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

  const distinctColors = [...new Set(tags.map(t => t.color ?? '#d9d9d9'))];
  const visibleTags = filterColors.length === 0
    ? tags
    : tags.filter(t => filterColors.includes(t.color ?? '#d9d9d9'));

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />
        <div className={styles.searchRow}>
          <div className={styles.searchField}>
            <SearchBar value={search} onChange={setSearch} />
          </div>
          <TagFilter colors={distinctColors} selected={filterColors} onChange={setFilterColors} />
        </div>

        <section className={styles.list}>
          {visibleTags.map((tag) => (
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
