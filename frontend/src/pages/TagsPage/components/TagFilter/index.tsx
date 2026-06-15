import { FilterButton, FilterSection, FilterChips, FilterChip } from '@/components/FilterButton';

interface Props {
  colors: string[];
  selected: string[];
  onChange: (colors: string[]) => void;
}

export function TagFilter({ colors, selected, onChange }: Props) {
  const toggle = (color: string) =>
    onChange(selected.includes(color) ? selected.filter(c => c !== color) : [...selected, color]);

  return (
    <FilterButton active={selected.length > 0}>
      <FilterSection label="Цвет">
        <FilterChips>
          {colors.map(color => (
            <FilterChip key={color} selected={selected.includes(color)} onClick={() => toggle(color)}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
              {color}
            </FilterChip>
          ))}
          {colors.length === 0 && <span>Нет тегов</span>}
        </FilterChips>
      </FilterSection>
    </FilterButton>
  );
}
