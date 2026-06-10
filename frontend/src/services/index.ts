import { MockTaskService } from './task/MockTaskService';
import { ApiTaskService } from './task/ApiTaskService';
import { MockValidationService } from './validation/MockValidationService';
import { ApiValidationService } from './validation/ApiValidationService';
import { MockDatasetService } from './dataset/MockDatasetService';
import { ApiDatasetService } from './dataset/ApiDatasetService';
import { MockUserService } from './user/MockUserService';
import { ApiUserService } from './user/ApiUserService';
import { MockTagService } from './tag/MockTagService';
import { ApiTagService } from './tag/ApiTagService';
import { MockUtilityService } from './utility/MockUtilityService';
import { ApiUtilityService } from './utility/ApiUtilityService';
import type { TaskService } from './task/TaskService';
import type { ValidationService } from './validation/ValidationService';
import type { DatasetService } from './dataset/DatasetService';
import type { UserService } from './user/UserService';
import type { TagService } from './tag/TagService';
import type { UtilityService } from './utility/UtilityService';

const USE_REAL_API = import.meta.env.VITE_API_MODE !== 'mock';
console.debug(`Is real launch mode: ${USE_REAL_API}`);

interface Services {
  task: TaskService;
  validation: ValidationService;
  dataset: DatasetService;
  user: UserService;
  tag: TagService;
  utility: UtilityService;
}

const services: Services = USE_REAL_API
  ? {
      task:       new ApiTaskService(),
      validation: new ApiValidationService(),
      dataset:    new ApiDatasetService(),
      user:       new ApiUserService(),
      tag:        new ApiTagService(),
      utility:    new ApiUtilityService(),
    }
  : {
      task:       new MockTaskService(),
      validation: new MockValidationService(),
      dataset:    new MockDatasetService(),
      user:       new MockUserService(),
      tag:        new MockTagService(),
      utility:    new MockUtilityService(),
    };

export const {
  task:       taskService,
  validation: validationService,
  dataset:    datasetService,
  user:       userService,
  tag:        tagService,
  utility:    utilityService,
} = services;

export type { TaskService }       from './task/TaskService';
export type { ValidationService } from './validation/ValidationService';
export type { DatasetService }    from './dataset/DatasetService';
export type { UserService }       from './user/UserService';
export type { TagService }        from './tag/TagService';
export type { UtilityService }    from './utility/UtilityService';
