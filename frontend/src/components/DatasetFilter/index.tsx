import { FilterButton, FilterSection, FilterChips, FilterChip } from '@/components/FilterButton';
import { AppTagPicker } from '@/components/AppTagSelector/components/AppTagPicker';
import type { AppTag } from '@/types/appTag';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Любой' },
  { value: 'NOT_STARTED', label: 'Не начато' },
  { value: 'IN_PROGRESS', label: 'В процессе' },
  { value: 'WAITING_VALIDATION', label: 'Ждёт проверки' },
  { value: 'LIMIT_REACHED', label: 'Квота выполнена' },
  { value: 'IDLE', label: 'Ожидание задач' },
  { value: 'COMPLETED', label: 'Завершён' },
];

interface Props {
  selectedTags: AppTag[];
  status: string;
  onTagsChange: (tags: AppTag[]) => void;
  onStatusChange: (status: string) => void;
}

export function DatasetFilter({ selectedTags, status, onTagsChange, onStatusChange }: Props) {
  const active = selectedTags.length > 0 || status !== '';

  const toggleTag = (tag: AppTag) => {
    onTagsChange(
      selectedTags.some(t => t.id === tag.id)
        ? selectedTags.filter(t => t.id !== tag.id)
        : [...selectedTags, tag],
    );
  };

  return (
    <FilterButton active={active}>
      <FilterSection label="Статус">
        <FilterChips>
          {STATUS_OPTIONS.map(o => (
            <FilterChip key={o.value} selected={status === o.value} onClick={() => onStatusChange(o.value)}>
              {o.label}
            </FilterChip>
          ))}
        </FilterChips>
      </FilterSection>
      <FilterSection>
        <AppTagPicker selectedTags={selectedTags} onToggle={toggleTag} />
      </FilterSection>
    </FilterButton>
  );
}
