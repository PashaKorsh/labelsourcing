// Базовый URL бэкенда. Задаётся через VITE_API_URL в .env, по умолчанию — текущий origin.
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

// Все маршруты бэкенда в одном месте.
export const API = {
  auth: {
    login:           () => `${API_BASE}/api/auth/login`,
    yandexLogin:     () => `${API_BASE}/api/auth/yandex/login`,
    yandexCallback:  () => `${API_BASE}/api/auth/yandex/callback`,
  },
  users: {
    me:     () => `${API_BASE}/api/users/me`,
    list:   () => `${API_BASE}/api/users/`,
    update: (id: string) => `${API_BASE}/api/users/${id}`,
  },
  datasets: {
    list:   () => `${API_BASE}/api/datasets/`,
    create: () => `${API_BASE}/api/datasets/`,
    detail: (id: string) => `${API_BASE}/api/datasets/${id}`,
    update: (id: string) => `${API_BASE}/api/datasets/${id}`,
  },
  tasks: {
    create:    () => `${API_BASE}/api/tasks/`,
    batch:     () => `${API_BASE}/api/tasks/batch`,
    byDataset: (id: string) => `${API_BASE}/api/tasks/dataset/${id}`,
    next:      (datasetId: string) => `${API_BASE}/api/tasks/dataset/${datasetId}/next`,
  },
  labels: {
    create:       () => `${API_BASE}/api/labels/`,
    updateStatus: (id: string) => `${API_BASE}/api/labels/${id}/status`,
  },
  tags: {
    list:   () => `${API_BASE}/api/tags/`,
    create: () => `${API_BASE}/api/tags/`,
    update: (id: string) => `${API_BASE}/api/tags/${id}`,
    delete: (id: string) => `${API_BASE}/api/tags/${id}`,
  },
} as const;

// Обёртка fetch с автоматической подстановкой JWT-токена из localStorage.
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${detail}`);
  }
  return res;
}
