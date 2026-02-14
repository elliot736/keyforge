import React, { useState, useCallback, useEffect } from 'react';
import type { KeyForgeTheme } from '../styles/theme';
import { generateCssVars, resolveTheme } from '../styles/theme';
import { injectKeyframes } from '../styles/base';
import { KeyForgeProvider, useKeyForgeContext } from '../context/KeyForgeContext';
import { useKeys, type CreateKeyResult } from '../hooks/useKeys';
import { KeyTable } from './KeyTable';
import { CreateKeyDialog } from './CreateKeyDialog';
import { UsageChart } from './UsageChart';

export interface KeyPortalProps {
  apiUrl: string;
  sessionToken: string;
  workspaceId: string;
  userId: string;
  theme?: KeyForgeTheme;
  onKeyCreated?: (key: { id: string; prefix: string }) => void;
  onError?: (error: Error) => void;
  className?: string;
  style?: React.CSSProperties;
}

type Tab = 'keys' | 'usage';

function PortalInner({
  onKeyCreated,
  onError,
}: {
  onKeyCreated?: (key: { id: string; prefix: string }) => void;
  onError?: (error: Error) => void;
}) {
  const { styles, theme } = useKeyForgeContext();
  const { keys, loading, error, createKey, revokeKey, rotateKey } = useKeys();
  const [activeTab, setActiveTab] = useState<Tab>('keys');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'revoke' | 'rotate';
    keyId: string;
  } | null>(null);
  const [rotatedKey, setRotatedKey] = useState<CreateKeyResult | null>(null);

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  const handleRevoke = useCallback(
    async (keyId: string) => {
      try {
        await revokeKey(keyId);
        setConfirmAction(null);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [revokeKey, onError],
  );

  const handleRotate = useCallback(
    async (keyId: string) => {
      try {
        const result = await rotateKey(keyId);
        setRotatedKey(result);
        setConfirmAction(null);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [rotateKey, onError],
  );

  return (
    <div>
      {/* Tabs */}
      <div style={styles.tabs}>
        <button type="button" style={styles.tab(activeTab === 'keys')} onClick={() => setActiveTab('keys')}>
          Keys
        </button>
        <button type="button" style={styles.tab(activeTab === 'usage')} onClick={() => setActiveTab('usage')}>
          Usage
        </button>
      </div>

      {/* Keys Tab */}
      {activeTab === 'keys' && (
        <div>
          <KeyTable
            keys={keys}
            loading={loading}
            onRevoke={(keyId) => setConfirmAction({ type: 'revoke', keyId })}
            onRotate={(keyId) => setConfirmAction({ type: 'rotate', keyId })}
            onCreate={() => setCreateDialogOpen(true)}
          />

          <CreateKeyDialog
            open={createDialogOpen}
            onClose={() => setCreateDialogOpen(false)}
            onCreateKey={createKey}
            onKeyCreated={onKeyCreated}
            onError={onError}
          />

          {/* Confirm Revoke/Rotate Dialog */}
          {confirmAction && (
            <div style={styles.overlay} onClick={() => setConfirmAction(null)}>
              <div style={{ ...styles.modal, maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ ...styles.heading, fontSize: '16px' }}>
                  {confirmAction.type === 'revoke' ? 'Revoke Key' : 'Rotate Key'}
                </h3>
                <p style={{ color: theme.colors.textSecondary, fontSize: '14px', margin: '0 0 20px' }}>
                  {confirmAction.type === 'revoke'
                    ? 'Are you sure you want to revoke this key? This action cannot be undone. Any applications using this key will immediately lose access.'
                    : 'This will create a new key and mark the current one for expiration. The old key will remain valid for a short grace period.'}
                </p>
                <div style={{ ...styles.flexRow, justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    style={{ ...styles.button, ...styles.buttonSecondary }}
                    onClick={() => setConfirmAction(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.button,
                      ...(confirmAction.type === 'revoke' ? styles.buttonDanger : styles.buttonPrimary),
                    }}
                    onClick={() => {
                      if (confirmAction.type === 'revoke') {
                        handleRevoke(confirmAction.keyId);
                      } else {
                        handleRotate(confirmAction.keyId);
                      }
                    }}
                  >
                    {confirmAction.type === 'revoke' ? 'Revoke' : 'Rotate'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rotated Key Result */}
          {rotatedKey && (
            <div style={styles.overlay} onClick={() => setRotatedKey(null)}>
              <div style={{ ...styles.modal, maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ ...styles.heading, fontSize: '16px' }}>Key Rotated</h3>
                <div style={styles.keyRevealBox}>
                  <p style={{ ...styles.label, color: theme.colors.warning, marginBottom: '8px' }}>
                    Save this new key now. It will not be shown again.
                  </p>
                  <div
                    style={{
                      fontFamily: '"SF Mono", Consolas, monospace',
                      padding: '12px',
                      wordBreak: 'break-all',
                      fontSize: '13px',
                      backgroundColor: theme.colors.background,
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: theme.borderRadius,
                    }}
                  >
                    {rotatedKey.key}
                  </div>
                  <button
                    type="button"
                    style={{ ...styles.button, ...styles.buttonPrimary, marginTop: '12px', width: '100%' }}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(rotatedKey.key);
                      } catch { /* noop */ }
                    }}
                  >
                    Copy Key
                  </button>
                </div>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.buttonSecondary, marginTop: '12px', width: '100%' }}
                  onClick={() => setRotatedKey(null)}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Usage Tab */}
      {activeTab === 'usage' && <UsageChart />}
    </div>
  );
}

export function KeyPortal({
  apiUrl,
  sessionToken,
  workspaceId,
  userId,
  theme,
  onKeyCreated,
  onError,
  className,
  style,
}: KeyPortalProps) {
  useEffect(() => {
    injectKeyframes();
  }, []);

  const resolved = resolveTheme(theme);
  const cssVars = generateCssVars(theme ?? {});

  return (
    <div
      className={className}
      style={{
        fontFamily: resolved.fontFamily,
        color: resolved.colors.text,
        backgroundColor: resolved.colors.background,
        lineHeight: 1.5,
        fontSize: '14px',
        boxSizing: 'border-box',
        padding: '20px',
        ...cssVars as React.CSSProperties,
        ...style,
      }}
    >
      <KeyForgeProvider
        apiUrl={apiUrl}
        sessionToken={sessionToken}
        workspaceId={workspaceId}
        userId={userId}
        theme={theme}
      >
        <PortalInner onKeyCreated={onKeyCreated} onError={onError} />
      </KeyForgeProvider>
    </div>
  );
}
