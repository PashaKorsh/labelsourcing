import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { SearchBar } from '../../components/SearchBar';
import { RoleBadge } from '../../components/RoleBadge';
import { ROUTES, buildRoute } from '../../config/routes';
import { datasetService } from '../../services';
import type { Dataset } from '../../types/dataset';
import styles from './MyDatasetsPage.module.css';

export function MyDatasetsPage() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      datasetService.listMine(search || undefined)
        .then(setDatasets)
        .catch(err => console.error('[MyDatasetsPage]', err))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

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
