import type { LocalAgent, PairingCodeResult } from '../../types/agent';
import type { AgentService } from './AgentService';
import { API, apiFetch } from '../../config/api';

interface AgentDto {
  id: string;
  name: string;
  base_url: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export class ApiAgentService implements AgentService {
  async list(): Promise<LocalAgent[]> {
    const res = await apiFetch(API.agents.list());
    const dtos: AgentDto[] = await res.json();
    return dtos.map(d => ({
      id: d.id,
      name: d.name,
      baseUrl: d.base_url,
      isActive: d.is_active,
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
    }));
  }

  async createPairingCode(): Promise<PairingCodeResult> {
    const res = await apiFetch(API.agents.pairingCode(), { method: 'POST' });
    const dto = await res.json();
    return { code: dto.code, expiresIn: dto.expires_in };
  }

  async deactivate(id: string): Promise<void> {
    await apiFetch(API.agents.deactivate(id), { method: 'DELETE' });
  }
}
