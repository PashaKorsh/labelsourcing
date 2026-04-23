import DatasetCard from './DatasetCard';
import type { Dataset } from '../types/dataset';

interface TaskListProps {
  tasks: Dataset[];
}

export function TaskList({ tasks }: TaskListProps) {
  return (
    <section className="flex flex-col self-stretch gap-[8px]">
      {tasks.map((task) => (
        <DatasetCard key={task.title} dataset={task} />
      ))}
    </section>
  );
}
