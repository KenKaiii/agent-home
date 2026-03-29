import { create } from 'zustand';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface ConnectionStore {
  status: ConnectionStatus;
  lastError: string | null;
  relayUrl: string;
  token: string | null;
  setStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  setRelayUrl: (url: string) => void;
  setToken: (token: string | null) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'disconnected',
  lastError: null,
  relayUrl: 'ws://localhost:8080/ws',
  token: null,
  setStatus: (status) => set({ status }),
  setError: (lastError) => set({ lastError }),
  setRelayUrl: (relayUrl) => set({ relayUrl: relayUrl.trim() }),
  setToken: (token) => set({ token: token ? token.replace(/\s/g, '') : null }),
}));
