import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import { useAuth } from '../../context/auth';
import { agentService } from '../../services';
import type { LocalAgent } from '../../types/agent';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { user, logout } = useAuth();

  const [agents, setAgents] = useState<LocalAgent[]>([]);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  useEffect(() => {
    agentService.list().then(setAgents).catch(() => {});
  }, []);

  const handleGetCode = async () => {
    setCodeLoading(true);
    setPairingCode(null);
    try {
      const { code } = await agentService.createPairingCode();
      setPairingCode(code);
    } catch {
      // ignore
    } finally {
      setCodeLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    setDeactivating(id);
    try {
      await agentService.deactivate(id);
      setAgents(prev => prev.filter(a => a.id !== id));
      if (pairingCode) setPairingCode(null);
    } finally {
      setDeactivating(null);
    }
  };

  const formatLastSeen = (ts: string | null) => {
    if (!ts) return 'никогда';
    const d = new Date(ts);
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />

        {user && (
          <>
            <div className={styles.card}>
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="Аватар пользователя" className={styles.avatar} />
              )}
              <h1 className={styles.name}>{user.name ?? user.email}</h1>
              <p className={styles.email}>{user.email}</p>
              {user.tags.map(tag => (
                <RoleBadge key={tag.id} role={tag} />
              ))}
              <button type="button" className={styles.logoutButton} onClick={logout}>
                Выйти
              </button>
            </div>

            <div className={styles.stats}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>42</span>
                <span className={styles.statLabel}>Размечено</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>18</span>
                <span className={styles.statLabel}>Валидировано</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>94%</span>
                <span className={styles.statLabel}>Точность</span>
              </div>
            </div>

            <div className={styles.agentsCard}>
              <div className={styles.agentsHeader}>
                <h2 className={styles.agentsTitle}>Локальные агенты</h2>
                <button
                  type="button"
                  className={styles.pairButton}
                  onClick={handleGetCode}
                  disabled={codeLoading}
                >
                  {codeLoading ? 'Генерация…' : '+ Добавить агент'}
                </button>
              </div>

              {pairingCode && (
                <div className={styles.codeBox}>
                  <p className={styles.codeLabel}>Введите этот код в утилиту:</p>
                  <code className={styles.code}>{pairingCode}</code>
                  <p className={styles.codeHint}>
                    <span className={styles.mono}>
                      python agent.py pair &lt;server_url&gt; {pairingCode} &lt;public_url&gt;
                    </span>
                  </p>
                  <p className={styles.codeHintSecondary}>
                    Затем держите запущенным <span className={styles.mono}>python agent.py serve</span> — без
                    этого картинки из локальных датасетов не откроются.
                  </p>
                  <p className={styles.codeExpiry}>Код действителен 5 минут</p>
                  <button
                    type="button"
                    className={styles.codeDismiss}
                    onClick={() => setPairingCode(null)}
                  >
                    Закрыть
                  </button>
                </div>
              )}

              {agents.length === 0 && !pairingCode ? (
                <p className={styles.agentsEmpty}>Нет привязанных агентов</p>
              ) : (
                <ul className={styles.agentsList}>
                  {agents.map(agent => (
                    <li key={agent.id} className={styles.agentItem}>
                      <div className={styles.agentInfo}>
                        <span className={styles.agentName}>{agent.name}</span>
                        <span className={styles.agentUrl}>{agent.baseUrl}</span>
                        <span className={styles.agentSeen}>Был онлайн: {formatLastSeen(agent.lastSeenAt)}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.deactivateButton}
                        onClick={() => handleDeactivate(agent.id)}
                        disabled={deactivating === agent.id}
                      >
                        {deactivating === agent.id ? '…' : 'Отключить'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
