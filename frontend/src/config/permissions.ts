import { ROUTES } from './routes';

export const ROLE_ADMIN   = 'admin';
export const ROLE_CREATOR = 'creator';

/** Проверяет, есть ли хотя бы одна из требуемых ролей у пользователя.
 *  Пустой массив requiredRoles означает «доступно всем авторизованным». */
export function hasRole(userRoles: string[], requiredRoles: string[]): boolean {
  if (requiredRoles.length === 0) return true;
  return requiredRoles.some(r => userRoles.includes(r));
}

export interface NavItem {
  label: string;
  path: string;
  roles: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Датасеты',     path: ROUTES.home,       roles: [] },
  { label: 'Все датасеты', path: ROUTES.myDatasets,  roles: [ROLE_ADMIN] },
  { label: 'Мои датасеты', path: ROUTES.myDatasets,  roles: [ROLE_CREATOR] },
  { label: 'Пользователи', path: ROUTES.users,       roles: [ROLE_ADMIN] },
  { label: 'Теги',         path: ROUTES.tags,        roles: [ROLE_ADMIN] },
];
