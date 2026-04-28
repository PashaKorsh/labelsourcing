export const ROUTES = {
  login:               '/login',
  home:                '/datasets',
  datasetAnnotation:   '/dataset/:datasetId',
  datasetValidation:   '/dataset/:datasetId/validation',
} as const;

/** Подставляет параметры в шаблон маршрута. */
export function buildRoute(route: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (path, [key, val]) => path.replace(`:${key}`, val),
    route,
  );
}
