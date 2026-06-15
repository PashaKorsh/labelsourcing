import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { TaskList } from './components/TaskList';
import { DatasetFilter } from '@/components/DatasetFilter';
import { datasetService } from '@/services';
import type { Dataset } from '@/types/dataset';
import type { AppTag } from '@/types/appTag';

export function DatasetsListPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTags, setFilterTags] = useState<AppTag[]>([]);
  const [filterStatus, setFilterStatus] = useState('');

  const fetchDatasets = useCallback((isInitial: boolean, currentSearch: string, tags: AppTag[], status: string) => {
    if (isInitial) setLoading(true);
    datasetService.list({
      search: currentSearch || undefined,
      tagIds: tags.length > 0 ? tags.map(t => t.id) : undefined,
      status: status || undefined,
    })
      .then(setDatasets)
      .catch(err => console.error('[DatasetsListPage]', err))
      .finally(() => { if (isInitial) setLoading(false); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => fetchDatasets(true, search, filterTags, filterStatus), 300);
    return () => clearTimeout(timer);
  }, [search, filterTags, filterStatus, fetchDatasets]);

  // Обновляем статусы при возврате на вкладку — валидация могла завершиться пока пользователь
  // был в другом месте, и его датасет перешёл из WAITING_VALIDATION обратно в IN_PROGRESS.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchDatasets(false, search, filterTags, filterStatus);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [search, filterTags, filterStatus, fetchDatasets]);

  return (
    <main className="min-h-screen bg-[var(--bg)] py-[36px]">
      <div className="mx-auto flex w-[700px] flex-col gap-[8px] items-center">
        <ModeSwitcher />
        <PageHeader />
        <div className="flex w-full gap-[8px] items-center">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} />
          </div>
          <DatasetFilter
            selectedTags={filterTags}
            status={filterStatus}
            onTagsChange={setFilterTags}
            onStatusChange={setFilterStatus}
          />
        </div>
        {loading ? (
          <p style={{ color: '#888', marginTop: 32 }}>Загрузка…</p>
        ) : (
          <TaskList tasks={datasets} />
        )}
      </div>
    </main>
  );
}
