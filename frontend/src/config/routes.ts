export const ROUTES = {
  login:             '/login',
  home:              '/datasets',
  profile:           '/profile',
  myDatasets:        '/datasets/manage',
  datasetNew:        '/dataset/new',
  datasetEdit:       '/dataset/:datasetId/edit',
  datasetAnnotation: '/dataset/:datasetId',
  users:             '/users',
  tags:              '/tags',
} as const;

export function buildRoute(route: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (path, [key, val]) => path.replace(`:${key}`, val),
    route,
  );
}
