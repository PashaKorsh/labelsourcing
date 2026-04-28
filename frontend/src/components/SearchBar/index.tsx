import styles from './SearchBar.module.css';

export function SearchBar() {
  return (
    <input
      type="text"
      placeholder="Поиск"
      className={styles.input}
    />
  );
}
