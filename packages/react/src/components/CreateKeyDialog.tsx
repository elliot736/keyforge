import React, { useState, useCallback, type FormEvent } from 'react';
import type { Environment, RateLimitAlgorithm } from '@keyforge/shared';
import { useKeyForgeContext } from '../context/KeyForgeContext';
import type { CreateKeyParams, CreateKeyResult } from '../hooks/useKeys';

export interface CreateKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateKey: (params: CreateKeyParams) => Promise<CreateKeyResult>;
  onKeyCreated?: (key: { id: string; prefix: string }) => void;
  onError?: (error: Error) => void;
}

const ENVIRONMENTS: Environment[] = ['development', 'staging', 'production'];
const COMMON_SCOPES = ['read', 'write', 'admin', 'billing', 'analytics'];
const ALGORITHMS: { value: RateLimitAlgorithm; label: string }[] = [
  { value: 'fixed_window', label: 'Fixed Window' },
  { value: 'sliding_window', label: 'Sliding Window' },
  { value: 'token_bucket', label: 'Token Bucket' },
];

export function CreateKeyDialog({ open, onClose, onCreateKey, onKeyCreated, onError }: CreateKeyDialogProps) {
  const { styles, theme } = useKeyForgeContext();

  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [scopes, setScopes] = useState<string[]>([]);
  const [scopeInput, setScopeInput] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [enableRateLimit, setEnableRateLimit] = useState(false);
  const [rlAlgorithm, setRlAlgorithm] = useState<RateLimitAlgorithm>('sliding_window');
  const [rlLimit, setRlLimit] = useState('100');
  const [rlWindow, setRlWindow] = useState('60000');

  const [submitting, setSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreateKeyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const resetForm = useCallback(() => {
    setName('');
    setPrefix('');
    setEnvironment('production');
    setScopes([]);
    setScopeInput('');
    setExpiresAt('');
    setEnableRateLimit(false);
    setRlAlgorithm('sliding_window');
    setRlLimit('100');
    setRlWindow('60000');
    setSubmitting(false);
    setCreatedKey(null);
    setError(null);
    setKeyCopied(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const addScope = useCallback(
    (scope: string) => {
      const trimmed = scope.trim().toLowerCase();
      if (trimmed && !scopes.includes(trimmed)) {
        setScopes((prev) => [...prev, trimmed]);
      }
      setScopeInput('');
    },
    [scopes],
  );

  const removeScope = useCallback((scope: string) => {
    setScopes((prev) => prev.filter((s) => s !== scope));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError('Name is required');
        return;
      }
      setError(null);
      setSubmitting(true);

      const params: CreateKeyParams = {
        name: name.trim(),
        environment,
        scopes,
      };
      if (prefix.trim()) params.prefix = prefix.trim();
      if (expiresAt) params.expiresAt = new Date(expiresAt).toISOString();
      if (enableRateLimit) {
        params.rateLimitConfig = {
          algorithm: rlAlgorithm,
          limit: parseInt(rlLimit, 10) || 100,
          window: parseInt(rlWindow, 10) || 60000,
        };
      }

      try {
        const result = await onCreateKey(params);
        setCreatedKey(result);
        onKeyCreated?.({ id: result.id, prefix: result.prefix });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e.message);
        onError?.(e);
      } finally {
        setSubmitting(false);
      }
    },
    [name, prefix, environment, scopes, expiresAt, enableRateLimit, rlAlgorithm, rlLimit, rlWindow, onCreateKey, onKeyCreated, onError],
  );

  const copyKey = useCallback(async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 3000);
    } catch {
      // fallback
    }
  }, [createdKey]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.flexBetween, marginBottom: '20px' }}>
          <h2 style={{ ...styles.heading, margin: 0 }}>
            {createdKey ? 'Key Created' : 'Create API Key'}
          </h2>
          <button type="button" style={styles.buttonGhost} onClick={handleClose}>
            X
          </button>
        </div>

        {createdKey ? (
          <div>
            <div style={styles.keyRevealBox}>
              <p style={{ ...styles.label, color: theme.colors.warning, marginBottom: '8px' }}>
                Save this key now. It will not be shown again.
              </p>
              <div
                style={{
                  ...styles.monospace,
                  padding: '12px',
                  wordBreak: 'break-all',
                  fontSize: '13px',
                  backgroundColor: theme.colors.background,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius,
                }}
              >
                {createdKey.key}
              </div>
              <button
                type="button"
                style={{ ...styles.button, ...styles.buttonPrimary, marginTop: '12px', width: '100%' }}
                onClick={copyKey}
              >
                {keyCopied ? 'Copied!' : 'Copy Key to Clipboard'}
              </button>
            </div>
            <button
              type="button"
              style={{ ...styles.button, ...styles.buttonSecondary, marginTop: '12px', width: '100%' }}
              onClick={handleClose}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                style={{
                  ...styles.card,
                  backgroundColor: `${theme.colors.error}10`,
                  borderColor: theme.colors.error,
                  marginBottom: '16px',
                  padding: '10px 14px',
                  color: theme.colors.error,
                  fontSize: '13px',
                }}
              >
                {error}
              </div>
            )}

            {/* Name */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>
                Name <span style={{ color: theme.colors.error }}>*</span>
              </label>
              <input
                style={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My API Key"
                autoFocus
              />
            </div>

            {/* Prefix */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Prefix (optional)</label>
              <input
                style={styles.input}
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="sk_live"
                maxLength={20}
              />
              <span style={{ fontSize: '11px', color: theme.colors.textSecondary }}>
                Custom prefix for the key. If omitted, a default will be used.
              </span>
            </div>

            {/* Environment */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Environment</label>
              <select
                style={styles.select}
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as Environment)}
              >
                {ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>
                    {env.charAt(0).toUpperCase() + env.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Scopes */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Scopes</label>
              <div style={{ ...styles.flexRow, flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {scopes.map((scope) => (
                  <span
                    key={scope}
                    style={{
                      ...styles.badge(theme.colors.primary),
                      cursor: 'pointer',
                      gap: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    onClick={() => removeScope(scope)}
                    title="Click to remove"
                  >
                    {scope} x
                  </span>
                ))}
              </div>
              <div style={styles.flexRow}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  type="text"
                  value={scopeInput}
                  onChange={(e) => setScopeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addScope(scopeInput);
                    }
                  }}
                  placeholder="Type a scope and press Enter"
                />
              </div>
              <div style={{ ...styles.flexRow, flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {COMMON_SCOPES.filter((s) => !scopes.includes(s)).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    style={{
                      ...styles.buttonGhost,
                      fontSize: '11px',
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: '4px',
                      padding: '2px 8px',
                    }}
                    onClick={() => addScope(scope)}
                  >
                    + {scope}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiration */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Expiration (optional)</label>
              <input
                style={styles.input}
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>

            {/* Rate Limit */}
            <div style={styles.fieldGroup}>
              <label style={{ ...styles.flexRow, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enableRateLimit}
                  onChange={(e) => setEnableRateLimit(e.target.checked)}
                />
                <span style={styles.label}>Enable Rate Limiting</span>
              </label>
              {enableRateLimit && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.borderRadius,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Algorithm</label>
                    <select
                      style={styles.select}
                      value={rlAlgorithm}
                      onChange={(e) => setRlAlgorithm(e.target.value as RateLimitAlgorithm)}
                    >
                      {ALGORITHMS.map((alg) => (
                        <option key={alg.value} value={alg.value}>
                          {alg.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={styles.label}>Limit</label>
                      <input
                        style={styles.input}
                        type="number"
                        value={rlLimit}
                        onChange={(e) => setRlLimit(e.target.value)}
                        min="1"
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Window (ms)</label>
                      <input
                        style={styles.input}
                        type="number"
                        value={rlWindow}
                        onChange={(e) => setRlWindow(e.target.value)}
                        min="1000"
                        step="1000"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ ...styles.flexRow, justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" style={{ ...styles.button, ...styles.buttonSecondary }} onClick={handleClose}>
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  ...styles.button,
                  ...styles.buttonPrimary,
                  opacity: submitting ? 0.7 : 1,
                }}
                disabled={submitting}
              >
                {submitting ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
