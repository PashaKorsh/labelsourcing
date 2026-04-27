import { useNavigate, useParams, useLocation } from 'react-router-dom';
import type { AppMode } from '../../types/appMode';
import { MOCK_DATASET_ID } from '../../services/task/MockTaskService';
import { ROUTES, buildRoute } from '../../config/routes';
import styles from './ModeSwitcher.module.css';

const MODES: { id: AppMode; label: string }[] = [
  { id: 'auth', label: 'Вход' },
  { id: 'annotation', label: 'Аннотирование' },
  { id: 'validation', label: 'Валидация' },
];

function pathToMode(pathname: string): AppMode {
  if (pathname.startsWith('/dataset') && pathname.endsWith('/validation')) return 'validation';
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
    if (mode === 'auth') { navigate(ROUTES.login); return; }
    const route = mode === 'annotation' ? ROUTES.datasetAnnotation : ROUTES.datasetValidation;
    navigate(buildRoute(route, { datasetId: targetDatasetId }));
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
