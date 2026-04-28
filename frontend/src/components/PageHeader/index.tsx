import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  avatarUrl: string;
}

export function PageHeader({ title, avatarUrl }: PageHeaderProps) {
  return ( // TODO : вынести кнопку хедера в отдельный компонент
    <nav className={styles.nav}>
      <div className={styles.titleChip}>
        <span className={styles.titleText}>{title}</span>
      </div>
      <div className={styles.avatarWrapper}>
        <img
          src={avatarUrl}
          alt="Avatar"
          className={styles.avatarImage}
        />
      </div>
    </nav>
  );
}
