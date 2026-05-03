import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { SearchBar } from '../../components/SearchBar';
import { ROUTES } from '../../config/routes';
import { datasetService } from '../../services';
import type { Dataset } from '../../types/dataset';
import styles from './MyDatasetsPage.module.css';

export function MyDatasetsPage() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    datasetService.listMine()
      .then(setDatasets)
      .catch(err => console.error('[MyDatasetsPage]', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />
        <SearchBar />

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
                  {dataset.taskCount !== undefined && (
                    <p className={styles.meta}>{dataset.taskCount} заданий</p>
                  )}
                </div>
                <button type="button" className={styles.editButton}>Редактировать</button>
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
