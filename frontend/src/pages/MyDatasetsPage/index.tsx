import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { SearchBar } from '../../components/SearchBar';
import styles from './MyDatasetsPage.module.css';

const AVATAR_URL = 'https://picsum.photos/seed/labelsourcing-avatar/80/80';

const MOCK_DATASETS = [
  {
    id: 1,
    title: 'Датасет с кошками',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-cat-1/400/240',
    taskCount: 248,
    published: true,
  },
  {
    id: 2,
    title: 'Датасет с собаками',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-dog-1/400/240',
    taskCount: 134,
    published: false,
  },
  {
    id: 3,
    title: 'Природные объекты',
    imageUrl: 'https://picsum.photos/seed/labelsourcing-nature-1/400/240',
    taskCount: 76,
    published: true,
  },
];

export function MyDatasetsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader title="Мои датасеты" avatarUrl={AVATAR_URL} />
        <SearchBar />

        <section className={styles.list}>
          {MOCK_DATASETS.map((dataset) => (
            <div key={dataset.id} className={styles.row}>
              <img src={dataset.imageUrl} alt="" className={styles.image} />
              <div className={styles.info}>
                <h2 className={styles.title}>{dataset.title}</h2>
                <p className={styles.meta}>
                  {dataset.taskCount} заданий · {dataset.published ? 'Опубликован' : 'Черновик'}
                </p>
              </div>
              <button type="button" className={styles.editButton}>Редактировать</button>
            </div>
          ))}
        </section>

        <button type="button" className={styles.createButton}>+ Создать датасет</button>
      </div>
    </main>
  );
}
