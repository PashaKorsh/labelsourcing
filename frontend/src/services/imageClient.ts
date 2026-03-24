import type { ImageLocator } from '../types/task';

/**
 * Knows how to resolve an ImageLocator into a URL the browser can display.
 * Implementations may return:
 *   - A direct HTTPS URL (public storage / CDN / presigned S3)
 *   - A blob: URL (for private endpoints that require auth headers)
 *   - A data: URL (base64 fallback)
 *
 * If the implementation creates a blob: URL it MUST implement `revoke` so the
 * caller can release the object URL when it is no longer needed.
 */
export interface ImageClient {
  readonly sourceId: string;
  resolve(locator: ImageLocator): Promise<string>;
  revoke?(objectUrl: string): void;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, ImageClient>();

export function registerImageClient(client: ImageClient): void {
  registry.set(client.sourceId, client);
}

export function getImageClient(sourceId: string): ImageClient {
  const client = registry.get(sourceId);
  if (!client) throw new Error(`No ImageClient registered for source: "${sourceId}"`);
  return client;
}

// ─── Mock implementation ──────────────────────────────────────────────────────
// Treats params.url as a ready-to-use URL. Replace with a real client that
// fetches from S3/MinIO/your API and returns a blob: URL if needed.

class MockImageClient implements ImageClient {
  readonly sourceId = 'mock';

  async resolve(locator: ImageLocator): Promise<string> {
    const { url } = locator.params;
    if (!url) throw new Error('MockImageClient: locator.params.url is required');
    return url;
  }
  // No revoke needed — we're not creating blob: URLs.
}

registerImageClient(new MockImageClient());
