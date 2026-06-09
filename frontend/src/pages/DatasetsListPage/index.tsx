import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { TaskList } from './components/TaskList';
import { datasetService } from '@/services';
import type { Dataset } from '@/types/dataset';

export function DatasetsListPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchDatasets = useCallback((isInitial: boolean, currentSearch: string) => {
    if (isInitial) setLoading(true);
    datasetService.list({ search: currentSearch || undefined })
      .then(setDatasets)
      .catch(err => console.error('[DatasetsListPage]', err))
      .finally(() => { if (isInitial) setLoading(false); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => fetchDatasets(true, search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchDatasets]);

  // Обновляем статусы при возврате на вкладку — валидация могла завершиться пока пользователь
  // был в другом месте, и его датасет перешёл из WAITING_VALIDATION обратно в IN_PROGRESS.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchDatasets(false, search);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [search, fetchDatasets]);

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
