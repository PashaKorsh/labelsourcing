import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import styles from './CompletedScreen.module.css';

interface Props {
  message?: string;
}

export function CompletedScreen({ message = 'Все задачи выполнены' }: Props) {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <p className={styles.message}>{message}</p>
      <button className={styles.button} onClick={() => navigate(ROUTES.home)}>
        Вернуться на главную
      </button>
    </div>
  );
}
