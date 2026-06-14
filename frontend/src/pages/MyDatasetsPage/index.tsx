import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { SearchBar } from '../../components/SearchBar';
import { RoleBadge } from '../../components/RoleBadge';
import { ROUTES, buildRoute } from '../../config/routes';
import { datasetService } from '../../services';
import { useAuth } from '../../context/auth';
import { hasRole, ROLE_ADMIN } from '../../config/permissions';
import type { Dataset } from '../../types/dataset';
import styles from './MyDatasetsPage.module.css';

function triggerJsonDownload(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MyDatasetsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exportingIds, setExportingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // Админ видит все датасеты («Все датасеты»), модератор — только свои («Мои датасеты»)
    const mine = !hasRole(user.roles, [ROLE_ADMIN]);
    const timer = setTimeout(() => {
      datasetService.list({ search: search || undefined, mine })
        .then(setDatasets)
        .catch(err => console.error('[MyDatasetsPage]', err))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [user, search]);

  const handleExport = useCallback(async (dataset: Dataset) => {
    if (exportingIds.has(dataset.id)) return;
    setExportingIds(prev => new Set(prev).add(dataset.id));
    try {
      const data = await datasetService.exportLabels(dataset.id);
      const name = dataset.title ?? dataset.description ?? dataset.id;
      triggerJsonDownload(data, `${name}.json`);
    } catch (err) {
      console.error('[MyDatasetsPage] export:', err);
    } finally {
      setExportingIds(prev => {
        const next = new Set(prev);
        next.delete(dataset.id);
        return next;
      });
    }
  }, [exportingIds]);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />
        <SearchBar value={search} onChange={setSearch} />

        <section className={styles.list}>
          {loading ? (
            <p>Загрузка…</p>
          ) : (
            datasets.map((dataset) => (
              <div key={dataset.id} className={styles.row}>
                {dataset.imageUrl && (
                  <img src={dataset.imageUrl} alt="" className={styles.image} />
                )}
                <div className={styles.info}>
                  <h2 className={styles.title}>{dataset.title ?? dataset.description}</h2>
                  {dataset.tags.length > 0 && (
                    <div className={styles.tags}>
                      {dataset.tags.map(tag => (
                        <RoleBadge key={tag.id} role={tag} />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.exportButton}
                  onClick={() => handleExport(dataset)}
                  disabled={exportingIds.has(dataset.id)}
                  title="Выгрузить разметку"
                >
                  {exportingIds.has(dataset.id) ? '…' : '↓ JSON'}
                </button>
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => navigate(buildRoute(ROUTES.datasetEdit, { datasetId: dataset.id }))}
                >
                  Редактировать
                </button>
              </div>
            ))
          )}
        </section>

        <button
          type="button"
          className={styles.createButton}
          onClick={() => navigate(ROUTES.datasetNew)}
        >
          + Создать датасет
        </button>
      </div>
    </main>
  );
}
