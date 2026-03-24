/**
 * Describes WHERE an image lives, without containing the image data itself.
 * `source` matches an ImageClient.sourceId (e.g. 'mock', 's3', 'minio', 'http').
 * `params` are source-specific (e.g. bucket + key for S3, path for HTTP).
 */
export interface ImageLocator {
  source: string;
  params: Record<string, string>;
}

export interface AnnotationTask {
  id: string;
  locator: ImageLocator;
  name?: string;
}
