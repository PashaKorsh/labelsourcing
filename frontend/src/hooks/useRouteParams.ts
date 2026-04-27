import { useParams } from 'react-router-dom';

/**
 * Возвращает datasetId из URL-параметра `:datasetId`.
 * Логирует ошибку и возвращает null, если параметр отсутствует.
 */
export function useDatasetId(): string | null {
  const { datasetId } = useParams<{ datasetId: string }>();
  if (!datasetId) {
    console.error('[useDatasetId] datasetId отсутствует в маршруте');
    return null;
  }
  return datasetId;
}
