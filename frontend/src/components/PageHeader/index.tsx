import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import { useAuth } from '../../context/auth';
import { NAV_ITEMS, hasRole } from '../../config/permissions';
import { ThemeToggle } from '../ThemeToggle';
import styles from './PageHeader.module.css';
import profileLogo from '/src/assets/profile-image-stock-white-theme.png';

export function PageHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();

  const [avatarSrc, setAvatarSrc] = useState(profileLogo);

  useEffect(() => {
    if (!user?.avatarUrl) {
      setAvatarSrc(profileLogo);
      return;
    }
    const img = new Image();
    img.onload = () => setAvatarSrc(user.avatarUrl!);
    img.onerror = () => setAvatarSrc(profileLogo);
    img.src = user.avatarUrl;
  }, [user?.avatarUrl]);

  const visibleItems = NAV_ITEMS.filter(item => hasRole(user?.roles ?? [], item.roles));

  return (
    <nav className={styles.nav}>
      {visibleItems.map(({ label, path }) => (
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
        <img src={avatarSrc} alt="" className={styles.avatarImage} />
      </button>
      <ThemeToggle />
    </nav>
  );
}
