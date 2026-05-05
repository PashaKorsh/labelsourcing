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
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      datasetService.list({ search: search || undefined })
        .then(setDatasets)
        .catch(err => console.error('[DatasetsListPage]', err))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <main className="min-h-screen bg-[#f5f5f5] py-[36px]">
      <div className="mx-auto flex w-[700px] flex-col gap-[8px] items-center">
        <ModeSwitcher />
        <PageHeader />
        <SearchBar value={search} onChange={setSearch} />
        {loading ? (
          <p style={{ color: '#888', marginTop: 32 }}>Загрузка…</p>
        ) : (
          <TaskList tasks={datasets} />
        )}
      </div>
    </main>
  );
}
