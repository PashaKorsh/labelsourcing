// Базовый URL бэкенда. Задаётся через VITE_API_URL в .env, по умолчанию — текущий origin.
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

// Все маршруты бэкенда в одном месте.
export const API = {
  auth: {
    login:          () => `${API_BASE}/api/v1/auth/login`,
    logout:         () => `${API_BASE}/api/v1/auth/logout`,
    refresh:        () => `${API_BASE}/api/v1/auth/refresh`,
    yandexLogin:    () => `${API_BASE}/api/v1/auth/yandex/login`,
    yandexCallback: () => `${API_BASE}/api/v1/auth/yandex/callback`,
  },
  users: {
    me:     () => `${API_BASE}/api/v1/users/me`,
    list:   () => `${API_BASE}/api/v1/users/`,
    update: (id: string) => `${API_BASE}/api/v1/users/${id}`,
  },
  datasets: {
    list:   () => `${API_BASE}/api/v1/datasets/`,
    create: () => `${API_BASE}/api/v1/datasets/`,
    detail: (id: string) => `${API_BASE}/api/v1/datasets/${id}`,
    update: (id: string) => `${API_BASE}/api/v1/datasets/${id}`,
    delete: (id: string) => `${API_BASE}/api/v1/datasets/${id}`,
    tasks:  (id: string) => `${API_BASE}/api/v1/datasets/${id}/tasks`,
    next:   (id: string, count = 1) =>
      `${API_BASE}/api/v1/datasets/${id}/next?count=${count}`,
    stats:  (id: string) => `${API_BASE}/api/v1/datasets/${id}/stats`,
    export: (id: string) => `${API_BASE}/api/v1/datasets/${id}/export`,
  },
  tasks: {
    create:    () => `${API_BASE}/api/v1/tasks/`,
    batch:     () => `${API_BASE}/api/v1/tasks/batch`,
    delete:    (id: string) => `${API_BASE}/api/v1/tasks/${id}`,
    saveLabel: (taskId: string) => `${API_BASE}/api/v1/tasks/${taskId}/labels`,
  },
  proxy: {
    image: (taskId: string) => `${API_BASE}/api/v1/proxy/${taskId}`,
  },
  labels: {
    updateStatus: (id: string) => `${API_BASE}/api/v1/labels/${id}/status`,
  },
  tags: {
    list:   () => `${API_BASE}/api/v1/tags/`,
    create: () => `${API_BASE}/api/v1/tags/`,
    update: (id: string) => `${API_BASE}/api/v1/tags/${id}`,
    delete: (id: string) => `${API_BASE}/api/v1/tags/${id}`,
  },
  sources: {
    list: () => `${API_BASE}/api/v1/sources/`,
  },
} as const;

// Один активный запрос на обновление токена. Все параллельные 401 ждут его результата.
let pendingRefresh: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!pendingRefresh) {
    pendingRefresh = fetch(API.auth.refresh(), {
      method: 'POST',
      credentials: 'include',
    })
      .then(res => res.ok)
      .catch(() => false)
      .finally(() => { pendingRefresh = null; });
  }
  return pendingRefresh;
}

// Обёртка fetch с автоматической подстановкой cookie и обработкой 401.
// При 401 пытается обновить токены через refresh, затем повторяет запрос.
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const doFetch = () => fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  let res = await doFetch();

  if (res.status === 401 && !url.includes('/auth/refresh')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    }
  }

  if (res.status === 401) {
    // Уведомляем AuthProvider — он почистит localStorage и редиректнет на /login
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('401: Unauthorized');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${detail}`);
  }
  return res;
}
