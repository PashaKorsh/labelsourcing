import { FilterButton, FilterSection, FilterChips, FilterChip } from '@/components/FilterButton';
import { AppTagPicker } from '@/components/AppTagSelector/components/AppTagPicker';
import { roleLabel } from '../RoleMenu';
import type { Role } from '@/types/user';
import type { AppTag } from '@/types/appTag';

interface Props {
  allRoles: Role[];
  selectedRoles: string[];
  selectedTags: AppTag[];
  onRolesChange: (roles: string[]) => void;
  onTagsChange: (tags: AppTag[]) => void;
}

export function UserFilter({ allRoles, selectedRoles, selectedTags, onRolesChange, onTagsChange }: Props) {
  const active = selectedRoles.length > 0 || selectedTags.length > 0;

  const toggleRole = (name: string) =>
    onRolesChange(selectedRoles.includes(name) ? selectedRoles.filter(r => r !== name) : [...selectedRoles, name]);

  const toggleTag = (tag: AppTag) =>
    onTagsChange(selectedTags.some(t => t.id === tag.id) ? selectedTags.filter(t => t.id !== tag.id) : [...selectedTags, tag]);

  return (
    <FilterButton active={active}>
      <FilterSection label="Роли">
        <FilterChips>
          {allRoles.map(r => (
            <FilterChip key={r.id} selected={selectedRoles.includes(r.name)} onClick={() => toggleRole(r.name)}>
              {roleLabel(r.name)}
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
