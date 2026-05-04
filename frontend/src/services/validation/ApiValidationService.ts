import type { ValidationTask, ValidationVerdict, ValidationResult } from '../../types/validationTask';
import type { ValidationService } from './ValidationService';
import { API, apiFetch } from '../../config/api';

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

  // Отправляет вердикты через PATCH /api/labels/{id}/status.
  // Требует, чтобы ValidationTask содержала labelId — появится после реализации загрузки.
  async submit(): Promise<void> {
    const results = this.getResults();
    console.warn('[ApiValidationService] submit() вызван, но labelId недоступен — вердикты не отправлены:', results);

    // Будущая реализация (когда ValidationTask будет содержать labelId):
    // await Promise.all(results.map(r =>
    //   apiFetch(API.labels.updateStatus(r.labelId), {
    //     method: 'PATCH',
    //     body: JSON.stringify({ status: r.verdict }),
    //   })
    // ));
    void apiFetch; // убирает warning о неиспользуемом импорте
    void API;
  }
}
