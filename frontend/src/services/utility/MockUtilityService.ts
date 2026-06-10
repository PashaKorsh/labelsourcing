import type { Utility, PairingCode, DirListing, ScanResult } from '../../types/utility';
import type { UtilityService } from './UtilityService';

export class MockUtilityService implements UtilityService {
  private utilities: Utility[] = [];

  async list(): Promise<Utility[]> {
    return this.utilities;
  }

  async createPairingCode(): Promise<PairingCode> {
    return { code: 'MOCK-1234', expiresAt: new Date(Date.now() + 600000).toISOString() };
  }

  async delete(id: string): Promise<void> {
    this.utilities = this.utilities.filter(u => u.id !== id);
  }

  async listDirs(): Promise<DirListing> {
    return { path: '', parent: null, dirs: [], imageCount: 0 };
  }

  async scan(): Promise<ScanResult> {
    return { folder: '', added: 0, total: 0 };
  }

  async rescan(): Promise<ScanResult> {
    return { folder: '', added: 0, total: 0 };
  }
}
