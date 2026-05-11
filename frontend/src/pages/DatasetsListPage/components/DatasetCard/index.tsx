import { useNavigate } from 'react-router-dom';
import { type Dataset } from '../../../../types/dataset';
import { PlayButton } from '../../../../components/PlayButton';
import { RoleBadge } from '../../../../components/RoleBadge';
import { ROUTES, buildRoute } from '../../../../config/routes';
import styles from './DatasetCard.module.css';

type Props = {
  dataset: Dataset;
};

export function DatasetCard({ dataset }: Props) {
  const navigate = useNavigate();
  const isDone = dataset.userDone ?? false;

  const handlePlay = () => {
    if (isDone) return;
    navigate(buildRoute(ROUTES.datasetAnnotation, { datasetId: dataset.id }));
  };

  return (
    <div className={styles.card}>
      {dataset.imageUrl && (
        <img
          src={dataset.imageUrl}
          alt=""
          className={`${styles.image} ${dataset.completed ? styles.dimmed : ''}`}
        />
      )}

      <div className={`${styles.content} ${dataset.completed ? styles.dimmed : ''}`}>
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
            {isDone ? (
              <span className={styles.doneBadge}>✓ Выполнено</span>
            ) : (
              <PlayButton onClick={handlePlay} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
