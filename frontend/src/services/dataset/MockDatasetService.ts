import type { Dataset } from '../../types/dataset';
import type { AnnotationTask } from '../../types/task';
import type { DatasetService, DatasetListParams, DatasetCreateInput, DatasetUpdateInput } from './DatasetService';

const TAG_MEDIC = { id: 'tag-medic', name: 'Медик', color: '#eb5757' };
const TAG_USER  = { id: 'tag-user',  name: 'Пользователь', color: '#d9d9d9' };

const MOCK_LIST: Dataset[] = [
  {
    id: '0',
    title: 'Набор 1',
    description: 'Небольшое описание набора 1.\nМаксимум две строки (?)...',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-1/400/240',
    tags: [TAG_MEDIC],
    userStatus: 'NOT_STARTED',
  },
  {
    id: '1',
    title: 'Набор 2',
    description: 'Небольшое описание набора 2.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-2/400/240',
    tags: [TAG_MEDIC],
    userStatus: 'IN_PROGRESS',
  },
  {
    id: '2',
    title: 'Набор 3',
    description: 'Небольшое описание набора 3.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-3/400/240',
    tags: [TAG_USER],
    userStatus: 'NOT_STARTED',
  },
  {
    id: '3',
    title: 'Пройденный набор',
    description: 'Небольшое описание набора 4.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-4/400/240',
    tags: [TAG_MEDIC],
    userStatus: 'IDLE',
  },
];

const MOCK_MINE: Dataset[] = [
  {
    id: '10',
    title: 'Датасет с кошками',
    description: 'Датасет с кошками',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-1/400/240',
    tags: [],
    taskCount: 248,
    userStatus: 'NOT_STARTED',
  },
  {
    id: '11',
    title: 'Датасет с собаками',
    description: 'Датасет с собаками',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-dog-1/400/240',
    tags: [],
    taskCount: 134,
    userStatus: 'NOT_STARTED',
  },
  {
    id: '12',
    title: 'Природные объекты',
    description: 'Природные объекты',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-nature-1/400/240',
    tags: [],
    taskCount: 76,
    userStatus: 'NOT_STARTED',
  },
];

export class MockDatasetService implements DatasetService {
  private datasets: Dataset[] = [...MOCK_LIST];
  private mineDatasets: Dataset[] = [...MOCK_MINE];
  private tasksByDataset: Map<string, AnnotationTask[]> = new Map([
    ['10', [
      { id: 'task-ds10-1', datasetId: '10', imageUrl: 'https://picsum.photos/seed/ds10-1/400/300' },
      { id: 'task-ds10-2', datasetId: '10', imageUrl: 'https://picsum.photos/seed/ds10-2/400/300' },
    ]],
    ['11', [
      { id: 'task-ds11-1', datasetId: '11', imageUrl: 'https://picsum.photos/seed/ds11-1/400/300' },
    ]],
  ]);

  async list(params?: DatasetListParams): Promise<Dataset[]> {
    let result = [...this.datasets];
    if (params?.search) {
      const q = params.search.toLowerCase();
      result = result.filter(d => (d.title ?? d.description ?? '').toLowerCase().includes(q));
    }
    return result;
  }

  async get(id: string): Promise<Dataset> {
    const ds = [...this.datasets, ...this.mineDatasets].find(d => d.id === id);
    if (!ds) throw new Error(`Dataset ${id} not found`);
    return { ...ds };
  }

  async getTasks(datasetId: string): Promise<AnnotationTask[]> {
    return [...(this.tasksByDataset.get(datasetId) ?? [])];
  }

  async create(data: DatasetCreateInput): Promise<Dataset> {
    const dataset: Dataset = {
      id: String(Date.now()),
      title: data.title,
      description: data.description,
      tags: [],
      userStatus: 'NOT_STARTED',
      annotationLabels: data.annotationLabels,
    };
    this.mineDatasets.push(dataset);
    return dataset;
  }

  async update(id: string, data: DatasetUpdateInput): Promise<Dataset> {
    const allDatasets = [...this.datasets, ...this.mineDatasets];
    const target = allDatasets.find(d => d.id === id);
    if (!target) throw new Error(`Dataset ${id} not found`);
    const updated: Dataset = {
      ...target,
      title: data.title ?? target.title,
      description: data.description ?? target.description,
      annotationLabels: data.annotationLabels ?? target.annotationLabels,
      id,
    };

    const mineIdx = this.mineDatasets.findIndex(d => d.id === id);
    if (mineIdx !== -1) this.mineDatasets[mineIdx] = updated;
    else {
      const listIdx = this.datasets.findIndex(d => d.id === id);
      if (listIdx !== -1) this.datasets[listIdx] = updated;
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.datasets = this.datasets.filter(d => d.id !== id);
    this.mineDatasets = this.mineDatasets.filter(d => d.id !== id);
  }

  async exportLabels(_id: string): Promise<unknown[]> {
    return [];
  }
}
