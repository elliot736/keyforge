import React from 'react';
import type { KeyStatus } from '@keyforge/shared';
import { useKeyForgeContext } from '../context/KeyForgeContext';

export interface StatusBadgeProps {
  status: KeyStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { theme, styles } = useKeyForgeContext();

  const colorMap: Record<KeyStatus, string> = {
    active: theme.colors.success,
    expired: theme.colors.warning,
    revoked: theme.colors.error,
  };

  const color = colorMap[status] ?? theme.colors.textSecondary;

  return <span style={styles.badge(color)}>{status}</span>;
}
