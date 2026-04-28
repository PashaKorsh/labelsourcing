import { type Dataset } from '../../../../types/dataset';
import { PlayButton } from '../../../../components/PlayButton';
import { RoleBadge } from '../../../../components/RoleBadge';
import styles from './DatasetCard.module.css';

type Props = {
  dataset: Dataset;
};

export function DatasetCard({ dataset }: Props) {
  return (
    <div className={styles.card}>
      <img
        src={dataset.imageUrl}
        alt=""
        className={`${styles.image} ${dataset.completed ? styles.dimmed : ''}`}
      />

      <div className={`${styles.content} ${dataset.completed ? styles.dimmed : ''}`}>
        <div className={styles.textGroup}>
          <h2 className={styles.title}>{dataset.title}</h2>
          <p className={styles.description}>{dataset.description}</p>
        </div>

        <div className={styles.footer}>
          <div className={styles.tags}>
            {dataset.tags.map((role) => (
              <RoleBadge key={role.name} role={role} />
            ))}
          </div>
          <PlayButton />
        </div>
      </div>
    </div>
  );
}
