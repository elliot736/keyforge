import type { CSSProperties } from 'react';
import type { RequiredKeyForgeTheme } from './theme';

export function createStyles(t: RequiredKeyForgeTheme) {
  const radius = t.borderRadius;

  return {
    root: {
      fontFamily: t.fontFamily,
      color: t.colors.text,
      backgroundColor: t.colors.background,
      lineHeight: 1.5,
      fontSize: '14px',
      boxSizing: 'border-box',
    } satisfies CSSProperties,

    card: {
      backgroundColor: t.colors.surface,
      border: `1px solid ${t.colors.border}`,
      borderRadius: radius,
      padding: '16px',
    } satisfies CSSProperties,

    heading: {
      fontSize: '18px',
      fontWeight: 600,
      margin: '0 0 16px 0',
      color: t.colors.text,
    } satisfies CSSProperties,

    subheading: {
      fontSize: '14px',
      fontWeight: 500,
      margin: '0 0 8px 0',
      color: t.colors.textSecondary,
    } satisfies CSSProperties,

    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '13px',
    } satisfies CSSProperties,

    th: {
      textAlign: 'left' as const,
      padding: '10px 12px',
      borderBottom: `2px solid ${t.colors.border}`,
      color: t.colors.textSecondary,
      fontWeight: 600,
      fontSize: '12px',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
      cursor: 'pointer',
      userSelect: 'none' as const,
      whiteSpace: 'nowrap' as const,
    } satisfies CSSProperties,

    td: {
      padding: '10px 12px',
      borderBottom: `1px solid ${t.colors.border}`,
      verticalAlign: 'middle' as const,
    } satisfies CSSProperties,

    button: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      padding: '8px 16px',
      borderRadius: radius,
      border: 'none',
      fontSize: '13px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'opacity 0.15s, background-color 0.15s',
      fontFamily: t.fontFamily,
      lineHeight: 1.5,
    } satisfies CSSProperties,

    buttonPrimary: {
      backgroundColor: t.colors.primary,
      color: '#ffffff',
    } satisfies CSSProperties,

    buttonSecondary: {
      backgroundColor: 'transparent',
      color: t.colors.text,
      border: `1px solid ${t.colors.border}`,
    } satisfies CSSProperties,

    buttonDanger: {
      backgroundColor: t.colors.error,
      color: '#ffffff',
    } satisfies CSSProperties,

    buttonSmall: {
      padding: '4px 10px',
      fontSize: '12px',
    } satisfies CSSProperties,

    buttonGhost: {
      backgroundColor: 'transparent',
      color: t.colors.textSecondary,
      border: 'none',
      padding: '4px 8px',
    } satisfies CSSProperties,

    input: {
      display: 'block',
      width: '100%',
      padding: '8px 12px',
      borderRadius: radius,
      border: `1px solid ${t.colors.border}`,
      backgroundColor: t.colors.background,
      color: t.colors.text,
      fontSize: '14px',
      fontFamily: t.fontFamily,
      outline: 'none',
      boxSizing: 'border-box' as const,
      transition: 'border-color 0.15s',
    } satisfies CSSProperties,

    select: {
      display: 'block',
      width: '100%',
      padding: '8px 12px',
      borderRadius: radius,
      border: `1px solid ${t.colors.border}`,
      backgroundColor: t.colors.background,
      color: t.colors.text,
      fontSize: '14px',
      fontFamily: t.fontFamily,
      outline: 'none',
      boxSizing: 'border-box' as const,
      cursor: 'pointer',
    } satisfies CSSProperties,

    label: {
      display: 'block',
      fontSize: '13px',
      fontWeight: 500,
      marginBottom: '4px',
      color: t.colors.text,
    } satisfies CSSProperties,

    fieldGroup: {
      marginBottom: '16px',
    } satisfies CSSProperties,

    overlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    } satisfies CSSProperties,

    modal: {
      backgroundColor: t.colors.background,
      borderRadius: radius,
      padding: '24px',
      width: '100%',
      maxWidth: '520px',
      maxHeight: '90vh',
      overflow: 'auto' as const,
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      border: `1px solid ${t.colors.border}`,
    } satisfies CSSProperties,

    tabs: {
      display: 'flex',
      gap: '0',
      borderBottom: `2px solid ${t.colors.border}`,
      marginBottom: '20px',
    } satisfies CSSProperties,

    tab: (active: boolean) => ({
      padding: '10px 20px',
      border: 'none',
      borderBottom: active ? `2px solid ${t.colors.primary}` : '2px solid transparent',
      marginBottom: '-2px',
      backgroundColor: 'transparent',
      color: active ? t.colors.primary : t.colors.textSecondary,
      fontWeight: active ? 600 : 400,
      fontSize: '14px',
      cursor: 'pointer',
      fontFamily: t.fontFamily,
      transition: 'color 0.15s',
    } satisfies CSSProperties),

    badge: (color: string) => ({
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.025em',
      textTransform: 'uppercase' as const,
      backgroundColor: `${color}18`,
      color,
    } satisfies CSSProperties),

    emptyState: {
      textAlign: 'center' as const,
      padding: '40px 20px',
      color: t.colors.textSecondary,
    } satisfies CSSProperties,

    errorText: {
      color: t.colors.error,
      fontSize: '12px',
      marginTop: '4px',
    } satisfies CSSProperties,

    monospace: {
      fontFamily: '"SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
      fontSize: '12px',
      backgroundColor: t.colors.surface,
      padding: '2px 6px',
      borderRadius: '4px',
      border: `1px solid ${t.colors.border}`,
    } satisfies CSSProperties,

    keyRevealBox: {
      backgroundColor: t.colors.surface,
      border: `1px solid ${t.colors.warning}`,
      borderRadius: radius,
      padding: '16px',
      marginTop: '12px',
    } satisfies CSSProperties,

    flexRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    } satisfies CSSProperties,

    flexBetween: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    } satisfies CSSProperties,

    spinner: {
      display: 'inline-block',
      width: '16px',
      height: '16px',
      border: `2px solid ${t.colors.border}`,
      borderTopColor: t.colors.primary,
      borderRadius: '50%',
      animation: 'kf-spin 0.6s linear infinite',
    } satisfies CSSProperties,
  };
}

/** Inject keyframes once for spinner animation */
let keyframesInjected = false;
export function injectKeyframes(): void {
  if (keyframesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `@keyframes kf-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
  keyframesInjected = true;
}
