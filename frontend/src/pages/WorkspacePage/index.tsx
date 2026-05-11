import { ModeSwitcher } from '../../components/ModeSwitcher';
import { ExpiryTimer } from '../../components/ExpiryTimer';
import { AnnotationView } from './AnnotationView';
import { ValidationView } from './ValidationView';
import { useWorkspace } from './useWorkspace';
import styles from './WorkspacePage.module.css';

export function WorkspacePage() {
  const {
    task,
    taskIndex,
    taskOffset,
    hasMoreTasks,
    labelingLimit,
    tasks,
    tags,
    isExpired,
    canGoPrev,
    canGoNext,
    isCurrentTaskSaved,
    markSaved,
    navigateTo,
  } = useWorkspace();

  const isValidationTask = task?.type === 'validation';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Label Sourcing</h1>

        <ModeSwitcher />

        <nav className={styles.taskNav}>
          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex - 1)}
            disabled={!canGoPrev}
          >
            ← Пред
          </button>

          <span className={styles.taskCounter}>
            {task ? (
              <>
                {(task.metadata?.name as string | undefined) ?? `Задача ${taskOffset + taskIndex + 1}`}
                {isValidationTask && <span className={styles.validationBadge}>Валидация</span>}
                <span className={styles.taskIndex}>
                  {taskOffset + taskIndex + 1} / {labelingLimit ?? tasks.length}
                </span>
              </>
            ) : 'Готово'}
            {task?.expiresAt && <ExpiryTimer expiresAt={task.expiresAt} />}
          </span>

          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex + 1)}
            disabled={!canGoNext}
          >
            След →
          </button>
        </nav>
      </header>

      {isValidationTask ? (
        <ValidationView
          task={task!}
          tags={tags}
          onSaved={() => markSaved(task!.id)}
        />
      ) : (
        <AnnotationView
          task={task}
          hasMoreTasks={hasMoreTasks}
          tags={tags}
          isExpired={isExpired}
          isSaved={isCurrentTaskSaved}
          onSaved={() => task && markSaved(task.id)}
          onPrev={canGoPrev ? () => navigateTo(taskIndex - 1) : undefined}
          onNext={canGoNext ? () => navigateTo(taskIndex + 1) : undefined}
        />
      )}
    </div>
  );
}
