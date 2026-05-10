import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const USER_KEY = '@pawn/user';

export type AuthUser = {
    id: number;
    name: string;
    level: string;
};

type AuthContextValue = {
    user: AuthUser | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(USER_KEY);
                if (raw) setUser(JSON.parse(raw));
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const res = await api.auth.login({ username, password });
        if (res.success && res.user) {
            const nextUser: AuthUser = {
                id: res.user.id,
                name: res.user.name,
                level: res.user.level,
            };
            setUser(nextUser);
            try {
                await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
            } catch {
                // ignore
            }
            return { success: true };
        }
        return { success: false, message: res.message || 'Login failed' };
    }, []);

    const logout = useCallback(async () => {
        setUser(null);
        try {
            await AsyncStorage.removeItem(USER_KEY);
        } catch {
            // ignore
        }
    }, []);

    const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
};
