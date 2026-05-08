import { useState, useEffect } from 'react';

// Backend отдаёт naive UTC datetime без Z-суффикса.
// Без него JS парсит строку как локальное время — добавляем Z.
function toUTC(isoString: string): string {
  return isoString.endsWith('Z') || isoString.includes('+') ? isoString : isoString + 'Z';
}

export function useIsExpired(expiresAt: string | undefined): boolean {
  const [expired, setExpired] = useState(() =>
    !!expiresAt && new Date(toUTC(expiresAt)).getTime() <= Date.now()
  );

  useEffect(() => {
    if (!expiresAt) { setExpired(false); return; }
    const ms = new Date(toUTC(expiresAt)).getTime() - Date.now();
    if (ms <= 0) { setExpired(true); return; }
    setExpired(false);
    const id = setTimeout(() => setExpired(true), ms);
    return () => clearTimeout(id);
  }, [expiresAt]);

  return expired;
}
