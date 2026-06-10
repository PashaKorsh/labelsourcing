import type { Utility, PairingCode, DirListing, ScanResult } from '../../types/utility';

export interface UtilityService {
  list(): Promise<Utility[]>;
  createPairingCode(): Promise<PairingCode>;
  delete(id: string): Promise<void>;
  listDirs(utilityId: string, path: string): Promise<DirListing>;
  scan(utilityId: string, datasetId: string, path: string): Promise<ScanResult>;
  rescan(utilityId: string, datasetId: string): Promise<ScanResult>;
}
