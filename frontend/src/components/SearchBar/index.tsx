import styles from './SearchBar.module.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Поиск' }: Props) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      className={styles.input}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}
