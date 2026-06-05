import { useNavigate } from 'react-router-dom';
import { type Dataset } from '../../../../types/dataset';
import { PlayButton } from '../../../../components/PlayButton';
import { RoleBadge } from '../../../../components/RoleBadge';
import { ROUTES, buildRoute } from '../../../../config/routes';
import styles from './DatasetCard.module.css';

type Props = {
  dataset: Dataset;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  COMPLETED:           { label: '✓ Завершён',            className: styles.doneBadge },
  LIMIT_REACHED:       { label: '✓ Квота выполнена',     className: styles.doneBadge },
  IN_PROGRESS:         { label: '● В процессе',          className: styles.inProgressBadge },
  WAITING_VALIDATION:  { label: '⏳ Ждёт проверки',      className: styles.waitingBadge },
  IDLE:                { label: '○ Ожидание задач',      className: styles.idleBadge },
};

export function DatasetCard({ dataset }: Props) {
  const navigate = useNavigate();
  const { userStatus } = dataset;
  const isFinished = userStatus === 'COMPLETED' || userStatus === 'LIMIT_REACHED' || userStatus === 'WAITING_VALIDATION' || userStatus === 'IDLE';
  const badge = STATUS_BADGE[userStatus];

  const handlePlay = () => {
    if (isFinished) return;
    navigate(buildRoute(ROUTES.datasetAnnotation, { datasetId: dataset.id }));
  };

  return (
    <div className={styles.card}>
      {dataset.imageUrl && (
        <img
          src={dataset.imageUrl}
          alt=""
          className={`${styles.image} ${isFinished ? styles.dimmed : ''}`}
        />
      )}

      <div className={`${styles.content} ${isFinished ? styles.dimmed : ''}`}>
        <div className={styles.textGroup}>
          <h2 className={styles.title}>{dataset.title ?? dataset.description}</h2>
          {dataset.title && <p className={styles.description}>{dataset.description}</p>}
        </div>

        <div className={styles.footer}>
          <div className={styles.tags}>
            {dataset.tags.map((tag) => (
              <RoleBadge key={tag.id} role={tag} />
            ))}
          </div>
          <div className={styles.actions}>
            {badge && <span className={badge.className}>{badge.label}</span>}
            {!isFinished && <PlayButton onClick={handlePlay} />}
          </div>
        </div>
      </div>
    </div>
  );
}
