// Описывает, ГДЕ находится изображение, без самих данных.
// `source` совпадает с ImageClient.sourceId (например, 'mock', 's3', 'minio').
// `params` специфичны для источника (например, bucket + key для S3).
export interface ImageLocator {
  source: string;
  params: Record<string, string>;
}

export interface AnnotationTask {
  id: string;
  locator: ImageLocator;
  name?: string;
}
