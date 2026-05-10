export interface AnnotationTask {
  id: string;
  datasetId: string;
  imageUrl: string;
  type?: 'annotation' | 'validation';
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}
