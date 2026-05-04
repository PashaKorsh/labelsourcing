// Базовый URL бэкенда. Задаётся через VITE_API_URL в .env, по умолчанию — текущий origin.
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

// Все маршруты бэкенда в одном месте.
export const API = {
  auth: {
    login:          () => `${API_BASE}/api/v1/auth/login`,
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
    tasks:  (id: string) => `${API_BASE}/api/v1/datasets/${id}/tasks`,
    next:   (id: string) => `${API_BASE}/api/v1/datasets/${id}/next`,
  },
  tasks: {
    create:    () => `${API_BASE}/api/v1/tasks/`,
    batch:     () => `${API_BASE}/api/v1/tasks/batch`,
    delete:    (id: string) => `${API_BASE}/api/v1/tasks/${id}`,
    saveLabel: (taskId: string) => `${API_BASE}/api/v1/tasks/${taskId}/labels`,
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

// Обёртка fetch с автоматической подстановкой JWT-токена из localStorage.
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${detail}`);
  }
  return res;
}
