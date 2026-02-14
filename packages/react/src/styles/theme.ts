export interface KeyForgeTheme {
  mode?: 'light' | 'dark';
  colors?: {
    primary?: string;
    background?: string;
    surface?: string;
    text?: string;
    textSecondary?: string;
    border?: string;
    error?: string;
    success?: string;
    warning?: string;
  };
  borderRadius?: string;
  fontFamily?: string;
}

export type RequiredKeyForgeTheme = {
  mode: 'light' | 'dark';
  colors: Required<NonNullable<KeyForgeTheme['colors']>>;
  borderRadius: string;
  fontFamily: string;
};

export const defaultLightTheme: RequiredKeyForgeTheme = {
  mode: 'light',
  colors: {
    primary: '#2563eb',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    error: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
  },
  borderRadius: '8px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export const defaultDarkTheme: RequiredKeyForgeTheme = {
  mode: 'dark',
  colors: {
    primary: '#3b82f6',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    error: '#f87171',
    success: '#4ade80',
    warning: '#fbbf24',
  },
  borderRadius: '8px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export function resolveTheme(theme?: KeyForgeTheme): RequiredKeyForgeTheme {
  const base = theme?.mode === 'dark' ? defaultDarkTheme : defaultLightTheme;
  return {
    mode: theme?.mode ?? base.mode,
    colors: {
      ...base.colors,
      ...theme?.colors,
    },
    borderRadius: theme?.borderRadius ?? base.borderRadius,
    fontFamily: theme?.fontFamily ?? base.fontFamily,
  };
}

export function generateCssVars(theme: KeyForgeTheme): Record<string, string> {
  const resolved = resolveTheme(theme);
  return {
    '--kf-color-primary': resolved.colors.primary,
    '--kf-color-background': resolved.colors.background,
    '--kf-color-surface': resolved.colors.surface,
    '--kf-color-text': resolved.colors.text,
    '--kf-color-text-secondary': resolved.colors.textSecondary,
    '--kf-color-border': resolved.colors.border,
    '--kf-color-error': resolved.colors.error,
    '--kf-color-success': resolved.colors.success,
    '--kf-color-warning': resolved.colors.warning,
    '--kf-border-radius': resolved.borderRadius,
    '--kf-font-family': resolved.fontFamily,
  };
}
