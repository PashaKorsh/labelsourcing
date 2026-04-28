import { DatasetCard } from '../DatasetCard';
import type { Dataset } from '../../../../types/dataset';
import styles from './TaskList.module.css';

interface TaskListProps {
  tasks: Dataset[];
}

export function TaskList({ tasks }: TaskListProps) {
  return (
    <section className={styles.list}>
      {tasks.map((task) => (
        <DatasetCard key={task.id} dataset={task} />
      ))}
    </section>
  );
}
