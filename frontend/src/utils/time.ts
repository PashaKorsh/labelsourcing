// Бэкенд отдаёт naive UTC datetime без Z-суффикса; JS без него парсит как локальное время.
export function toUTC(isoString: string): string {
  return isoString.endsWith('Z') || isoString.includes('+') ? isoString : isoString + 'Z';
}

export function isExpiredAt(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(toUTC(expiresAt)).getTime() <= Date.now();
}
