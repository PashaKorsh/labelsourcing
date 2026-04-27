import type { ValidationTask, ValidationVerdict, ValidationResult } from '../../types/validationTask';
import type { ValidationService } from './ValidationService';

export class MockValidationService implements ValidationService {
  private readonly tasks: ValidationTask[] = [
    {
      id: 'val-1',
      name: 'Валидация 1 — PNG transparency demo',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
      annotations: [
        { shape: 'rectangle', left: 0.08, top: 0.1, width: 0.3, height: 0.25, tag: 'person' },
        { shape: 'rectangle', left: 0.55, top: 0.2, width: 0.25, height: 0.4, tag: 'vehicle' },
      ],
    },
    {
      id: 'val-2',
      name: 'Валидация 2 — React logo',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/3840px-React-icon.svg.png',
      annotations: [
        {
          shape: 'polygon',
          points: [
            { left: 0.3, top: 0.1 },
            { left: 0.7, top: 0.1 },
            { left: 0.85, top: 0.5 },
            { left: 0.7, top: 0.9 },
            { left: 0.3, top: 0.9 },
            { left: 0.15, top: 0.5 },
          ],
          tag: 'object',
        },
      ],
    },
    {
      id: 'val-3',
      name: 'Валидация 3 — Docker logo',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Docker_%28container_engine%29_logo.svg/1920px-Docker_%28container_engine%29_logo.svg.png',
      annotations: [
        { shape: 'rectangle', left: 0.05, top: 0.1, width: 0.9, height: 0.8, tag: 'object' },
      ],
    },
  ];

  private readonly verdicts = new Map<string, ValidationVerdict>();

  getTasks(): readonly ValidationTask[] {
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

  async submit(): Promise<void> {
    console.log('[MockValidationService] Результаты валидации:', JSON.stringify(this.getResults(), null, 2));
  }
}
