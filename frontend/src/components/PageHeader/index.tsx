import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import styles from './PageHeader.module.css';

const AVATAR_URL = 'https://picsum.photos/seed/labelsourcing-avatar/80/80';

const NAV_ITEMS = [
  { label: 'Датасеты',     path: ROUTES.home },
  { label: 'Мои датасеты', path: ROUTES.myDatasets },
  { label: 'Пользователи', path: ROUTES.users },
  { label: 'Теги',         path: ROUTES.tags },
] as const;

export function PageHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map(({ label, path }) => (
        <button
          key={path}
          type="button"
          className={`${styles.chip} ${pathname === path ? styles.chipActive : ''}`}
          onClick={() => navigate(path)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        className={styles.avatarWrapper}
        onClick={() => navigate(ROUTES.profile)}
        aria-label="Профиль"
      >
        <img src={AVATAR_URL} alt="" className={styles.avatarImage} />
      </button>
    </nav>
  );
}
