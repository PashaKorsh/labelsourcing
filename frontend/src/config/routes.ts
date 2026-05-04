export const ROUTES = {
  login:             '/login',
  home:              '/datasets',
  profile:           '/profile',
  myDatasets:        '/my_datasets',
  datasetNew:        '/dataset/new',
  datasetEdit:       '/dataset/:datasetId/edit',
  datasetAnnotation: '/dataset/:datasetId',
  datasetValidation: '/dataset/:datasetId/validation',
  users:             '/users',
  tags:              '/tags',
} as const;

/** Подставляет параметры в шаблон маршрута. */
export function buildRoute(route: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (path, [key, val]) => path.replace(`:${key}`, val),
    route,
  );
}
