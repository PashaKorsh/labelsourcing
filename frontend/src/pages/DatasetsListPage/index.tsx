import { useState, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { TaskList } from './components/TaskList';
import { datasetService } from '../../services';
import type { Dataset } from '../../types/dataset';

export function DatasetsListPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    datasetService.list()
      .then(setDatasets)
      .catch(err => console.error('[DatasetsListPage]', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#f5f5f5] py-[36px]">
      <div className="mx-auto flex w-[700px] flex-col gap-[8px] items-center">
        <ModeSwitcher />
        <PageHeader />
        <SearchBar />
        {loading ? (
          <p style={{ color: '#888', marginTop: 32 }}>Загрузка…</p>
        ) : (
          <TaskList tasks={datasets} />
        )}
      </div>
    </main>
  );
}
