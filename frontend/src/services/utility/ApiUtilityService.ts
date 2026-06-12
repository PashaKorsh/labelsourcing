import type { Utility, PairingCode, DirListing, ScanResult } from '@/types/utility';
import type { UtilityService } from './UtilityService';
import { API, apiFetch } from '@/config/api';

interface UtilityDto {
  id: string;
  name: string;
  public_base_url?: string | null;
  last_seen_at?: string | null;
  online: boolean;
  created_at: string;
}

function mapDto(dto: UtilityDto): Utility {
  return {
    id: dto.id,
    name: dto.name,
    publicBaseUrl: dto.public_base_url ?? undefined,
    lastSeenAt: dto.last_seen_at ?? undefined,
    online: dto.online,
    createdAt: dto.created_at,
  };
}

export class ApiUtilityService implements UtilityService {
  async list(): Promise<Utility[]> {
    const res = await apiFetch(API.utilities.list());
    const dtos: UtilityDto[] = await res.json();
    return dtos.map(mapDto);
  }

  async createPairingCode(): Promise<PairingCode> {
    const res = await apiFetch(API.utilities.pairingCode(), { method: 'POST' });
    const dto: { code: string; expires_at: string } = await res.json();
    return { code: dto.code, expiresAt: dto.expires_at };
  }

  async delete(id: string): Promise<void> {
    await apiFetch(API.utilities.delete(id), { method: 'DELETE' });
  }

  async listDirs(utilityId: string, path: string): Promise<DirListing> {
    const res = await apiFetch(API.utilities.dirs(utilityId, path));
    const dto: { path: string; parent: string | null; dirs: { name: string; path: string }[]; image_count: number } = await res.json();
    return { path: dto.path, parent: dto.parent, dirs: dto.dirs, imageCount: dto.image_count };
  }

  async scan(utilityId: string, datasetId: string, path: string): Promise<ScanResult> {
    const res = await apiFetch(API.utilities.scan(utilityId), {
      method: 'POST',
      body: JSON.stringify({ dataset_id: datasetId, path }),
    });
    return res.json();
  }

  async rescan(utilityId: string, datasetId: string): Promise<ScanResult> {
    const res = await apiFetch(API.utilities.rescan(utilityId, datasetId), { method: 'POST' });
    return res.json();
  }
}
