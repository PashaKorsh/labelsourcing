import type { Dataset } from '../../types/dataset';
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
  },
  {
    id: '1',
    title: 'Набор 2',
    description: 'Небольшое описание набора 2.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-2/400/240',
    tags: [TAG_MEDIC],
  },
  {
    id: '2',
    title: 'Набор 3',
    description: 'Небольшое описание набора 3.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-3/400/240',
    tags: [TAG_USER],
  },
  {
    id: '3',
    title: 'Пройденный набор',
    description: 'Небольшое описание набора 4.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-4/400/240',
    tags: [TAG_MEDIC],
    completed: true,
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
  },
  {
    id: '11',
    title: 'Датасет с собаками',
    description: 'Датасет с собаками',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-dog-1/400/240',
    tags: [],
    taskCount: 134,
  },
  {
    id: '12',
    title: 'Природные объекты',
    description: 'Природные объекты',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-nature-1/400/240',
    tags: [],
    taskCount: 76,
  },
];

export class MockDatasetService implements DatasetService {
  private datasets: Dataset[] = [...MOCK_LIST];

  async list(_params?: DatasetListParams): Promise<Dataset[]> {
    return [...this.datasets];
  }

  async listMine(): Promise<Dataset[]> {
    return [...MOCK_MINE];
  }

  async create(data: DatasetCreateInput): Promise<Dataset> {
    const dataset: Dataset = {
      id: String(Date.now()),
      description: data.description,
      tags: [],
    };
    this.datasets.push(dataset);
    return dataset;
  }

  async update(id: string, data: DatasetUpdateInput): Promise<Dataset> {
    const idx = this.datasets.findIndex(d => d.id === id);
    if (idx === -1) throw new Error(`Dataset ${id} not found`);
    const updated: Dataset = { ...this.datasets[idx], ...data, id };
    this.datasets[idx] = updated;
    return updated;
  }
}
