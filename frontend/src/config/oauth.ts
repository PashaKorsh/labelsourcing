const clientId = (import.meta.env.VITE_YANDEX_CLIENT_ID as string | undefined)
  ?? '347188b760b2420baacfa596cbc8ce57';

// Если не задан — Яндекс использует redirect_uri из настроек приложения
const redirectUri = (import.meta.env.VITE_YANDEX_REDIRECT_URI as string | undefined)
  ?? 'http://localhost/suggest/token.html'

export const YANDEX_OAUTH = {
  clientId,
  redirectUri,
};

export function buildYandexAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: YANDEX_OAUTH.clientId,
  });
  if (YANDEX_OAUTH.redirectUri) {
    params.set('redirect_uri', YANDEX_OAUTH.redirectUri);
  }
  return `https://oauth.yandex.ru/authorize?${params.toString()}`;
}
