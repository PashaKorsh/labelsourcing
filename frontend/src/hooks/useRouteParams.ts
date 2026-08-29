import { useParams } from 'react-router-dom';

export function useDatasetId(): string | null {
  const { datasetId } = useParams<{ datasetId: string }>();
  if (!datasetId) {
    console.error('[useDatasetId] datasetId отсутствует в маршруте');
    return null;
  }
  return datasetId;
}
