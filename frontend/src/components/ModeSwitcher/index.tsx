import { useNavigate, useParams, useLocation } from 'react-router-dom';
import type { AppMode } from '@/types/appMode';
import { MOCK_DATASET_ID } from '@/services/task/MockTaskService';
import { ROUTES, buildRoute } from '@/config/routes';
import styles from './ModeSwitcher.module.css';

const MODES: { id: AppMode; label: string }[] = [
  { id: 'auth',        label: 'Вход' },
  { id: 'datasets',    label: 'Датасеты' },
  { id: 'profile',     label: 'Профиль' },
  { id: 'my_datasets', label: 'Мои датасеты' },
  { id: 'dataset_new', label: 'Новый датасет' },
  { id: 'annotation',  label: 'Воркспейс' },
  { id: 'users',       label: 'Пользователи' },
  { id: 'tags',        label: 'Теги' },
];

function pathToMode(pathname: string): AppMode {
  if (pathname === ROUTES.home)       return 'datasets';
  if (pathname === ROUTES.profile)    return 'profile';
  if (pathname === ROUTES.myDatasets) return 'my_datasets';
  if (pathname === ROUTES.datasetNew) return 'dataset_new';
  if (pathname === ROUTES.users)      return 'users';
  if (pathname === ROUTES.tags)       return 'tags';
  if (pathname.startsWith('/dataset')) return 'annotation';
  return 'auth';
}

// Временный виджет для навигации между режимами в процессе разработки.
// Отображается только в development-среде.
export function ModeSwitcher() {
  if (!import.meta.env.DEV) return null;

  const navigate = useNavigate();
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { pathname } = useLocation();

  const currentMode = pathToMode(pathname);
  // Если datasetId нет в URL (например, на /login) — используем мок.
  const targetDatasetId = datasetId ?? MOCK_DATASET_ID;

  const handleClick = (mode: AppMode) => {
    if (mode === currentMode) return;
    switch (mode) {
      case 'auth':        navigate(ROUTES.login);      break;
      case 'datasets':    navigate(ROUTES.home);       break;
      case 'profile':     navigate(ROUTES.profile);    break;
      case 'my_datasets': navigate(ROUTES.myDatasets); break;
      case 'dataset_new': navigate(ROUTES.datasetNew); break;
      case 'users':       navigate(ROUTES.users);      break;
      case 'tags':        navigate(ROUTES.tags);       break;
      case 'annotation':
        navigate(buildRoute(ROUTES.datasetAnnotation, { datasetId: targetDatasetId })); break;
    }
  };

  return (
    <div className={styles.modeSwitcher}>
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          className={styles.modeButton}
          data-active={currentMode === id ? 'true' : undefined}
          onClick={() => handleClick(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
