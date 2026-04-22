import type { ImageLocator } from '../types/task';

// Знает, как превратить ImageLocator в URL, который браузер может отобразить.
// Реализации могут возвращать:
//   - прямой HTTPS-URL (публичное хранилище / CDN / presigned S3)
//   - blob: URL (для приватных эндпоинтов с auth-заголовками)
//   - data: URL (base64-fallback)
//
// Если реализация создаёт blob: URL, она ДОЛЖНА реализовывать `revoke`,
// чтобы вызывающий код мог освободить object URL после использования.
export interface ImageClient {
  readonly sourceId: string;
  resolve(locator: ImageLocator): Promise<string>;
  revoke?(objectUrl: string): void;
}

// ─── Реестр ──────────────────────────────────────────────────────────────────

const registry = new Map<string, ImageClient>();

export function registerImageClient(client: ImageClient): void {
  registry.set(client.sourceId, client);
}

export function getImageClient(sourceId: string): ImageClient {
  const client = registry.get(sourceId);
  if (!client) throw new Error(`Клиент не зарегистрирован для источника: "${sourceId}"`);
  return client;
}

// ─── Mock-реализация ──────────────────────────────────────────────────────────
// Использует params.url как готовый URL. Замените на реальный клиент,
// который получает данные из S3/MinIO/API и возвращает blob: URL при необходимости.

class MockImageClient implements ImageClient {
  readonly sourceId = 'mock';

  async resolve(locator: ImageLocator): Promise<string> {
    const { url } = locator.params;
    if (!url) throw new Error('MockImageClient: locator.params.url обязателен');
    return url;
  }
}

registerImageClient(new MockImageClient());
