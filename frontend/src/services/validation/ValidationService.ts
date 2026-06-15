import type { ValidationTask, ValidationVerdict, ValidationResult } from '@/types/validationTask';

export interface ValidationService {
  getTasks(): readonly ValidationTask[];
  setVerdict(taskId: string, verdict: ValidationVerdict): void;
  getVerdict(taskId: string): ValidationVerdict | null;
  getResults(): ValidationResult[];
  /** Отправляет результаты валидации на сервер. */
  submit(): Promise<void>;
}
