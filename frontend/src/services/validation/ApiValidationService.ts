import type { ValidationTask, ValidationVerdict, ValidationResult } from '@/types/validationTask';
import type { ValidationService } from './ValidationService';
import { API, apiFetch } from '@/config/api';

// NOTE: Загрузка задач для валидации требует эндпоинта GET /api/labels/task/{id}
// или аналогичного, которого пока нет на бэкенде. Когда появится — реализовать
// fetchValidationTasks(datasetId) и убрать предупреждение ниже.

export class ApiValidationService implements ValidationService {
  private tasks: ValidationTask[] = [];
  private readonly verdicts = new Map<string, ValidationVerdict>();

  getTasks(): readonly ValidationTask[] {
    if (this.tasks.length === 0) {
      console.warn('[ApiValidationService] Эндпоинт для загрузки задач валидации не реализован на бэкенде');
    }
    return this.tasks;
  }

  setVerdict(taskId: string, verdict: ValidationVerdict): void {
    this.verdicts.set(taskId, verdict);
  }

  getVerdict(taskId: string): ValidationVerdict | null {
    return this.verdicts.get(taskId) ?? null;
  }

  getResults(): ValidationResult[] {
    return this.tasks
      .filter(t => this.verdicts.has(t.id))
      .map(t => ({ taskId: t.id, verdict: this.verdicts.get(t.id)! }));
  }

  // Отправка через PATCH /labels/{id}/status требует labelId, которого пока нет
  async submit(): Promise<void> {
    const results = this.getResults();
    console.warn('[ApiValidationService] submit() вызван, но labelId недоступен — вердикты не отправлены:', results);

    void apiFetch;
    void API;
  }
}
