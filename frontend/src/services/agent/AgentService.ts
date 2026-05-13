import type { LocalAgent, PairingCodeResult } from '../../types/agent';

export interface AgentService {
  list(): Promise<LocalAgent[]>;
  createPairingCode(): Promise<PairingCodeResult>;
  deactivate(id: string): Promise<void>;
}
