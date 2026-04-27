import { MockTaskService } from './task/MockTaskService';
import { ApiTaskService } from './task/ApiTaskService';
import { MockValidationService } from './validation/MockValidationService';
import { ApiValidationService } from './validation/ApiValidationService';
import type { TaskService } from './task/TaskService';
import type { ValidationService } from './validation/ValidationService';

// VITE_API_MODE=real — реальные сервисы; всё остальное (в т.ч. отсутствие переменной) — моки.
const USE_REAL_API = import.meta.env.VITE_API_MODE === 'real';
console.debug(`Is real launch mode: ${USE_REAL_API}`)

const services: { task: TaskService; validation: ValidationService } = USE_REAL_API
  ? {
      task:       new ApiTaskService(),
      validation: new ApiValidationService(),
    }
  : {
      task:       new MockTaskService(),
      validation: new MockValidationService(),
    };

export const { task: taskService, validation: validationService } = services;

export type { TaskService } from './task/TaskService';
export type { ValidationService } from './validation/ValidationService';
