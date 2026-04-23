import React from 'react';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { TaskList } from '../../components/TaskList';
import type { Dataset } from '../../types/dataset';
import type { Tag } from '../../types/tag';

const medic: Tag = { name: 'Медик', color: '#eb5757' }
const user: Tag = { name: 'Пользователь', color: '#d9d9d9'}

const datasets: Dataset[] = [
  {
    id: 0,
    title: 'Набор 1',
    description: 'Небольшое описание набора 1.\nМаксимум две строки (?)...',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-1/400/240',
    tags: [medic],
  },
  {
    id: 1,
    title: 'Набор 2',
    description: 'Небольшое описание набора 2.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-2/400/240',
    tags: [medic],
  },
  {
    id: 2,
    title: 'Набор 3',
    description: 'Небольшое описание набора 3.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-3/400/240',
    tags: [user],
  },
  {
    id: 3,
    title: 'Пройденный набор',
    description: 'Небольшое описание набора 4.',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-4/400/240',
    tags: [medic],
    completed: true,
  },
];

export function DatasetsListPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f5] py-[36px]">
      <div className="mx-auto flex w-[700px] flex-col gap-[8px] items-center">
        <PageHeader
          title="Задания"
          avatarUrl="https://picsum.photos/seed/labelsourcing-avatar/80/80"
        />
        <SearchBar />
        <TaskList tasks={datasets} />
      </div>
    </main>
  );
}
