import { createContext } from 'react';
import type { User } from '@/lib/types';

export interface AuthState {
  admin: User | null;
  permissions: string[];
  loading: boolean;
  login: (payload: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (required: string | string[]) => boolean;
}

// Keep the context in a non-component module so its identity remains stable
// while the provider and consumers are updated by Vite Fast Refresh.
export const AuthContext = createContext<AuthState | undefined>(undefined);
