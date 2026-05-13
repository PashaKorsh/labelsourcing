export interface LocalAgent {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PairingCodeResult {
  code: string;
  expiresIn: number; // секунды
}
