export interface Utility {
  id: string;
  name: string;
  publicBaseUrl?: string;
  lastSeenAt?: string;
  online: boolean;
  createdAt: string;
}

export interface PairingCode {
  code: string;
  expiresAt: string;
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface DirListing {
  path: string;
  parent: string | null;
  dirs: DirEntry[];
  imageCount: number;
}

export interface ScanResult {
  folder: string;
  added: number;
  total: number;
}
