export interface AnnotationTask {
  id: string;
  datasetId: string;
  imageUrl: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}
