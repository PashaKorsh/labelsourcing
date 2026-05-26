import { ModeSwitcher } from '../../components/ModeSwitcher';
import { ExpiryTimer } from '../../components/ExpiryTimer';
import { AnnotationView } from './AnnotationView';
import { ValidationView } from './ValidationView';
import { useWorkspace } from './useWorkspace';
import styles from './WorkspacePage.module.css';

export function WorkspacePage() {
  const {
    task,
    taskNumber,
    hasMoreTasks,
    tasksLimit,
    allowedTools,
    tags,
    isExpired,
    canGoNext,
    isSaved,
    markSaved,
    goNext,
  } = useWorkspace();

  const isValidationTask = task?.type === 'validation';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Label Sourcing</h1>

        <ModeSwitcher />

        <nav className={styles.taskNav}>
          <span className={styles.taskCounter}>
            {task ? (
              <>
                {(task.metadata?.name as string | undefined) ?? `Задача ${taskNumber}`}
                {isValidationTask && <span className={styles.validationBadge}>Валидация</span>}
                <span className={styles.taskIndex}>
                  {taskNumber}{tasksLimit != null ? ` / ${tasksLimit}` : ''}
                </span>
              </>
            ) : 'Готово'}
            {task?.expiresAt && <ExpiryTimer expiresAt={task.expiresAt} />}
          </span>

          <button
            className={styles.navButton}
            onClick={goNext}
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
          isSaved={isSaved}
          onSaved={markSaved}
          onNext={canGoNext ? goNext : undefined}
        />
      ) : (
        <AnnotationView
          task={task}
          hasMoreTasks={hasMoreTasks}
          tags={tags}
          allowedTools={allowedTools}
          isExpired={isExpired}
          isSaved={isSaved}
          onSaved={markSaved}
          onNext={canGoNext ? goNext : undefined}
        />
      )}
    </div>
  );
}
