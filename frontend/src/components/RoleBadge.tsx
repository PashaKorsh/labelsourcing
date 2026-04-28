interface RoleBadgeProps {
  role: 'Медик' | 'Пользователь';
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const isMedic = role === 'Медик';
  return (
    <span
      className={[
        'inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[16px] leading-none',
        isMedic ? 'bg-rose-100 text-zinc-900' : 'bg-zinc-100 text-zinc-900',
      ].join(' ')}
    >
      {role}
    </span>
  );
}
