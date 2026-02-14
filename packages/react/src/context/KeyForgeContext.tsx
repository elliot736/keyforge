import React, { createContext, useContext, useMemo } from 'react';
import type { KeyForgeTheme, RequiredKeyForgeTheme } from '../styles/theme';
import { resolveTheme } from '../styles/theme';
import { createStyles } from '../styles/base';

export interface KeyForgeContextValue {
  apiUrl: string;
  sessionToken: string;
  workspaceId: string;
  userId: string;
  theme: RequiredKeyForgeTheme;
  styles: ReturnType<typeof createStyles>;
}

const KeyForgeContext = createContext<KeyForgeContextValue | null>(null);

export function useKeyForgeContext(): KeyForgeContextValue {
  const ctx = useContext(KeyForgeContext);
  if (!ctx) {
    throw new Error('useKeyForgeContext must be used within a KeyForgeProvider');
  }
  return ctx;
}

export interface KeyForgeProviderProps {
  apiUrl: string;
  sessionToken: string;
  workspaceId: string;
  userId: string;
  theme?: KeyForgeTheme;
  children: React.ReactNode;
}

export function KeyForgeProvider({
  children,
  apiUrl,
  sessionToken,
  workspaceId,
  userId,
  theme,
}: KeyForgeProviderProps) {
  const ctx = useMemo(() => {
    const resolved = resolveTheme(theme);
    return {
      apiUrl,
      sessionToken,
      workspaceId,
      userId,
      theme: resolved,
      styles: createStyles(resolved),
    };
  }, [apiUrl, sessionToken, workspaceId, userId, theme?.mode, theme?.colors?.primary, theme?.borderRadius, theme?.fontFamily]);

  return <KeyForgeContext.Provider value={ctx}>{children}</KeyForgeContext.Provider>;
}
