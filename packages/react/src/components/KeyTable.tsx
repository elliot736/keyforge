import React, { useState, useCallback, useMemo, type CSSProperties } from 'react';
import type { ApiKeyObject, KeyStatus } from '@keyforge/shared';
import { useKeyForgeContext } from '../context/KeyForgeContext';
import { StatusBadge } from './StatusBadge';

export interface KeyTableProps {
  keys: ApiKeyObject[];
  loading: boolean;
  onRevoke: (keyId: string) => void;
  onRotate: (keyId: string) => void;
  onCreate: () => void;
}

type SortField = 'name' | 'createdAt' | 'lastUsedAt';
type SortDir = 'asc' | 'desc';

function getKeyStatus(key: ApiKeyObject): KeyStatus {
  if (key.revokedAt) return 'revoked';
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return 'expired';
  return 'active';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export function KeyTable({ keys, loading, onRevoke, onRotate, onCreate }: KeyTableProps) {
  const { styles, theme } = useKeyForgeContext();
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField],
  );

  const sortedKeys = useMemo(() => {
    const sorted = [...keys].sort((a, b) => {
      let aVal: string | null;
      let bVal: string | null;
      switch (sortField) {
        case 'name':
          aVal = a.name ?? '';
          bVal = b.name ?? '';
          break;
        case 'lastUsedAt':
          aVal = a.lastUsedAt;
          bVal = b.lastUsedAt;
          break;
        case 'createdAt':
        default:
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
      }
      const compare = (aVal ?? '').localeCompare(bVal ?? '');
      return sortDir === 'asc' ? compare : -compare;
    });
    return sorted;
  }, [keys, sortField, sortDir]);

  const copyPrefix = useCallback(async (keyId: string, prefix: string) => {
    try {
      await navigator.clipboard.writeText(prefix);
      setCopiedId(keyId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API not available
    }
  }, []);

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  if (loading && keys.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.spinner} />
        <p>Loading keys...</p>
      </div>
    );
  }

  if (keys.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.4 }}>No API keys yet</div>
        <p style={{ color: theme.colors.textSecondary, marginBottom: '16px' }}>
          Create your first API key to get started.
        </p>
        <button
          type="button"
          style={{ ...styles.button, ...styles.buttonPrimary }}
          onClick={onCreate}
        >
          + Create Key
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ ...styles.flexBetween, marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', color: theme.colors.textSecondary }}>
          {keys.length} key{keys.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          style={{ ...styles.button, ...styles.buttonPrimary, ...styles.buttonSmall }}
          onClick={onCreate}
        >
          + Create Key
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th} onClick={() => handleSort('name')}>
                Name{sortIndicator('name')}
              </th>
              <th style={styles.th}>Key</th>
              <th style={styles.th}>Environment</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th} onClick={() => handleSort('lastUsedAt')}>
                Last Used{sortIndicator('lastUsedAt')}
              </th>
              <th style={styles.th} onClick={() => handleSort('createdAt')}>
                Created{sortIndicator('createdAt')}
              </th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedKeys.map((key) => {
              const status = getKeyStatus(key);
              const isActive = status === 'active';
              const rowStyle: CSSProperties = !isActive ? { opacity: 0.6 } : {};

              return (
                <tr key={key.id} style={rowStyle}>
                  <td style={styles.td}>
                    <span style={{ fontWeight: 500 }}>{key.name ?? '--'}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.monospace}>{key.prefix}...</span>
                    <button
                      type="button"
                      style={{ ...styles.buttonGhost, marginLeft: '4px', fontSize: '11px' }}
                      onClick={() => copyPrefix(key.id, key.prefix)}
                      title="Copy prefix"
                    >
                      {copiedId === key.id ? 'Copied!' : 'Copy'}
                    </button>
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        fontSize: '12px',
                        textTransform: 'capitalize',
                        color: theme.colors.textSecondary,
                      }}
                    >
                      {key.environment}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <StatusBadge status={status} />
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: theme.colors.textSecondary, fontSize: '13px' }}>
                      {formatRelativeDate(key.lastUsedAt)}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: theme.colors.textSecondary, fontSize: '13px' }}>
                      {formatDate(key.createdAt)}
                    </span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <div style={{ ...styles.flexRow, justifyContent: 'flex-end' }}>
                      {isActive && (
                        <>
                          <button
                            type="button"
                            style={{ ...styles.button, ...styles.buttonSecondary, ...styles.buttonSmall }}
                            onClick={() => onRotate(key.id)}
                          >
                            Rotate
                          </button>
                          <button
                            type="button"
                            style={{
                              ...styles.button,
                              ...styles.buttonSmall,
                              backgroundColor: 'transparent',
                              color: theme.colors.error,
                              border: `1px solid ${theme.colors.error}`,
                            }}
                            onClick={() => onRevoke(key.id)}
                          >
                            Revoke
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
