import type { ImageLocator } from './task';
import type { SerializedShape } from '../services/annotationSerializer';

// Задача для валидации: изображение + аннотации, сделанные другим пользователем
export interface ValidationTask {
  id: string;
  name?: string;
  locator: ImageLocator;
  /** Сериализованные аннотации от разметчика (JSON с нормализованными координатами) */
  annotations: SerializedShape[];
}

export type ValidationVerdict = 'approved' | 'rejected';

export interface ValidationResult {
  taskId: string;
  verdict: ValidationVerdict;
}
