import type { SerializedShape } from '../services/annotationSerializer';

export interface ValidationTask {
  id: string;
  name?: string;
  imageUrl: string;
  annotations: SerializedShape[];
}

export type ValidationVerdict = 'approved' | 'rejected';

export interface ValidationResult {
  taskId: string;
  verdict: ValidationVerdict;
}
