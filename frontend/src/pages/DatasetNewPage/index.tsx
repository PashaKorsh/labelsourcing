import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { AppTagSelector } from '../../components/AppTagSelector';
import { ROUTES, buildRoute } from '../../config/routes';
import { datasetService, agentService } from '../../services';
import type { AppTag } from '../../types/appTag';
import type { LocalAgent } from '../../types/agent';
import styles from './DatasetNewPage.module.css';

type SourceType = 'external_url' | 'local_agent';

export function DatasetNewPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<AppTag[]>([]);
  const [sourceType, setSourceType] = useState<SourceType>('external_url');
  const [agents, setAgents] = useState<LocalAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    agentService.list().then(list => {
      setAgents(list);
      if (list.length > 0) setSelectedAgentId(list[0].id);
    }).catch(() => {});
  }, []);

  const canSubmit =
    (title.trim() || description.trim()) &&
    (sourceType === 'external_url' || (sourceType === 'local_agent' && selectedAgentId));

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await datasetService.create({
        title: title.trim() || undefined,
        description: description.trim(),
        tagIds: selectedTags.map(t => t.id),
        sourceType,
        localAgentId: sourceType === 'local_agent' ? selectedAgentId : undefined,
      });
      if (sourceType === 'local_agent') {
        navigate(buildRoute(ROUTES.datasetEdit, { datasetId: created.id }), {
          state: { localAgentSyncHint: true },
        });
      } else {
        navigate(ROUTES.myDatasets);
      }
    } catch (err) {
      console.error('[DatasetNewPage]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />

        <div className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label}>Название</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Название набора"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Описание</label>
            <textarea
              className={styles.textarea}
              placeholder="Краткое описание датасета"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Роли</label>
            <AppTagSelector selectedTags={selectedTags} onTagsChange={setSelectedTags} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Источник изображений</label>
            <div className={styles.sourceToggle}>
              <button
                type="button"
                className={`${styles.sourceOption} ${sourceType === 'external_url' ? styles.sourceOptionActive : ''}`}
                onClick={() => setSourceType('external_url')}
              >
                Внешние URL
              </button>
              <button
                type="button"
                className={`${styles.sourceOption} ${sourceType === 'local_agent' ? styles.sourceOptionActive : ''}`}
                onClick={() => setSourceType('local_agent')}
                disabled={agents.length === 0}
                title={agents.length === 0 ? 'Сначала привяжите агент в профиле' : undefined}
              >
                Локальный агент{agents.length === 0 ? ' (нет агентов)' : ''}
              </button>
            </div>
          </div>

          {sourceType === 'local_agent' && agents.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>Агент</label>
              <select
                className={styles.select}
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.baseUrl}
                  </option>
                ))}
              </select>
              <p className={styles.agentHint}>
                Порядок: в профиле — <code className={styles.agentCmd}>pair</code>, на машине с картинками
                постоянно — <code className={styles.agentCmd}>serve</code>. Здесь нажмите «Создать» — сайт
                присвоит датасету ID. Уже после этого в терминале:{' '}
                <code className={styles.agentCmd}>python agent.py sync &lt;этот_ID&gt; /путь/к/папке</code>. До
                нажатия «Создать» команда <code className={styles.agentCmd}>sync</code> не сработает: в API
                нужен существующий датасет.
              </p>
            </div>
          )}

          <button
            type="button"
            className={styles.saveButton}
            onClick={handleCreate}
            disabled={submitting || !canSubmit}
          >
            {submitting ? 'Создание…' : 'Создать датасет'}
          </button>
        </div>
      </div>
    </main>
  );
}
