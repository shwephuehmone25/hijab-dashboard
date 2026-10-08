import React, { useEffect, useState, useCallback, ReactNode } from 'react';
import api from '@/lib/api';
import { User } from '@/lib/types';
import { skipLogin } from '@/lib/devAuth';
import { AuthContext } from './auth-context';

const previewAdmin: User = {
  id: 1,
  username: 'admin',
  email: '',
  display_name: 'Demo Admin',
  status: 1,
  roles: [{ name: 'admin', display_name: 'Administrator' }],
  permissions: ['*'],
  registered_at: '2024-01-01T00:00:00.000Z',
};

const readStoredAdmin = (): User | null => {
  if (!localStorage.getItem('access_token')) return null;
  const storedAdmin = localStorage.getItem('admin_user');
  if (!storedAdmin) return null;

  try {
    const parsed = JSON.parse(storedAdmin) as Partial<User>;
    return typeof parsed.id === 'number' && typeof parsed.username === 'string'
      ? parsed as User
      : null;
  } catch {
    localStorage.removeItem('admin_user');
    return null;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [initialAdmin] = useState<User | null>(() => skipLogin ? previewAdmin : readStoredAdmin());
  const [admin, setAdmin] = useState<User | null>(initialAdmin);
  const [permissions, setPermissions] = useState<string[]>(
    skipLogin ? ['*'] : initialAdmin?.permissions ?? [],
  );
  const [loading, setLoading] = useState(!skipLogin && initialAdmin === null);

  const loadProfile = async () => {
    try {
      const userData = await api.auth.me();
      setAdmin(userData);
      setPermissions(userData.permissions ?? []);
      localStorage.setItem('admin_user', JSON.stringify(userData));
    } catch (error) {
      console.error('Failed to load profile:', error);
      setAdmin(null);
      setPermissions([]);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('admin_user');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (skipLogin) return;
    if (localStorage.getItem('access_token') && !initialAdmin) {
      void loadProfile();
    } else {
      setLoading(false);
    }
  }, [initialAdmin]);

  useEffect(() => {
    if (skipLogin) return;
    const handleExpiredSession = () => {
      setAdmin(null);
      setPermissions([]);
      setLoading(false);
    };

    window.addEventListener('admin-auth-expired', handleExpiredSession);
    return () => window.removeEventListener('admin-auth-expired', handleExpiredSession);
  }, []);

  const login = async (payload: { username: string; password: string }) => {
    const res = await api.auth.login(payload);
    const { access_token, refresh_token, user } = res;

    if (!access_token || !refresh_token || !user) {
      throw new Error('The backend returned an incomplete login response.');
    }

    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('admin_user', JSON.stringify(user));

    setAdmin(user);
    setPermissions(user?.permissions ?? []);
  };

  const logout = async () => {
    if (skipLogin) return;
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('admin_user');
      setAdmin(null);
      setPermissions([]);
    }
  };

  const hasPermission = useCallback((required: string | string[]): boolean => {
    const requiredList = Array.isArray(required) ? required : [required];
    return requiredList.some(
      (perm) => permissions.includes('*') || permissions.includes(perm)
    );
  }, [permissions]);

  return (
    <AuthContext.Provider value={{ admin, permissions, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};
AuthProvider.displayName = 'AuthProvider';
