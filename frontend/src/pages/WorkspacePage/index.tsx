import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { ConfirmModal } from '@/components/ConfirmModal';
import { AnnotationView } from './components/AnnotationView';
import { ValidationView } from './components/ValidationView';
import { useWorkspace } from './useWorkspace';
import styles from './WorkspacePage.module.css';

export function WorkspacePage() {
  const {
    datasetId,
    task,
    taskNumber,
    hasMoreTasks,
    tasksLimit,
    allowedTools,
    tags,
    annotationInstructions,
    isExpired,
    canGoNext,
    isSaved,
    markSaved,
    goNext,
  } = useWorkspace();

  const [instructionsAccepted, setInstructionsAccepted] = useState(false);
  useEffect(() => { setInstructionsAccepted(false); }, [datasetId]);

  const isValidationTask = task?.type === 'validation';

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <ModeSwitcher />
        <PageHeader />
      </header>

      {isValidationTask ? (
        <ValidationView
          task={task!}
          taskNumber={taskNumber}
          tasksLimit={tasksLimit}
          tags={tags}
          isSaved={isSaved}
          onSaved={markSaved}
          onNext={canGoNext ? goNext : undefined}
        />
      ) : (
        <AnnotationView
          task={task}
          hasMoreTasks={hasMoreTasks}
          taskNumber={taskNumber}
          tasksLimit={tasksLimit}
          tags={tags}
          allowedTools={allowedTools}
          isExpired={isExpired}
          isSaved={isSaved}
          onSaved={markSaved}
          onNext={canGoNext ? goNext : undefined}
        />
      )}

      {annotationInstructions && !instructionsAccepted && (
        <ConfirmModal
          title="Инструкции к разметке"
          message={annotationInstructions}
          confirmLabel="Принять"
          onConfirm={() => setInstructionsAccepted(true)}
        />
      )}
    </div>
  );
}
