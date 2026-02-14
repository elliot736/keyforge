'use client';

import * as React from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Environment, RateLimitAlgorithm } from '@keyforge/shared';
import { ENVIRONMENTS, RATE_LIMIT_ALGORITHMS } from '@keyforge/shared';

interface CreateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  onCreated: () => void;
}

type Step = 'basic' | 'scopes' | 'ratelimit' | 'review' | 'created';

const COMMON_SCOPES = [
  'api.read',
  'api.write',
  'api.delete',
  'models.read',
  'models.write',
  'embeddings.create',
  'completions.create',
  'images.create',
  'files.read',
  'files.write',
];

export function CreateKeyDialog({ open, onOpenChange, workspace, onCreated }: CreateKeyDialogProps) {
  const [step, setStep] = React.useState<Step>('basic');
  const [submitting, setSubmitting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Form state
  const [name, setName] = React.useState('');
  const [prefix, setPrefix] = React.useState('');
  const [environment, setEnvironment] = React.useState<Environment>('production');
  const [scopes, setScopes] = React.useState<Set<string>>(new Set());
  const [customScope, setCustomScope] = React.useState('');
  const [expiresIn, setExpiresIn] = React.useState<string>('never');
  const [rateLimitEnabled, setRateLimitEnabled] = React.useState(false);
  const [rlAlgorithm, setRlAlgorithm] = React.useState<RateLimitAlgorithm>('sliding_window');
  const [rlLimit, setRlLimit] = React.useState('100');
  const [rlWindow, setRlWindow] = React.useState('60');

  // Result
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);

  const reset = () => {
    setStep('basic');
    setName('');
    setPrefix('');
    setEnvironment('production');
    setScopes(new Set());
    setCustomScope('');
    setExpiresIn('never');
    setRateLimitEnabled(false);
    setRlAlgorithm('sliding_window');
    setRlLimit('100');
    setRlWindow('60');
    setCreatedKey(null);
    setCopied(false);
    setSubmitting(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const toggleScope = (scope: string) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const addCustomScope = () => {
    const trimmed = customScope.trim();
    if (trimmed) {
      setScopes((prev) => new Set(prev).add(trimmed));
      setCustomScope('');
    }
  };

  const getExpiresAt = (): string | null => {
    if (expiresIn === 'never') return null;
    const now = new Date();
    const ms: Record<string, number> = {
      '1h': 3600000,
      '24h': 86400000,
      '7d': 604800000,
      '30d': 2592000000,
      '90d': 7776000000,
      '365d': 31536000000,
    };
    return new Date(now.getTime() + (ms[expiresIn] || 0)).toISOString();
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name || undefined,
        prefix: prefix || undefined,
        environment,
        scopes: Array.from(scopes),
        expiresAt: getExpiresAt(),
      };

      if (rateLimitEnabled) {
        body.rateLimitConfig = {
          algorithm: rlAlgorithm,
          limit: parseInt(rlLimit, 10),
          window: parseInt(rlWindow, 10) * 1000,
        };
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/v1/workspaces/${workspace}/keys`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setCreatedKey(data.data?.key || data.key || 'Key created');
        setStep('created');
        onCreated();
      } else {
        const error = await res.json().catch(() => null);
        alert(error?.message || 'Failed to create key');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const steps: Step[] = ['basic', 'scopes', 'ratelimit', 'review'];
  const stepIndex = steps.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {step === 'created' ? 'Key Created' : 'Create API Key'}
          </DialogTitle>
          <DialogDescription>
            {step === 'basic' && 'Configure basic key settings.'}
            {step === 'scopes' && 'Define what this key can access.'}
            {step === 'ratelimit' && 'Configure rate limiting (optional).'}
            {step === 'review' && 'Review and create your key.'}
            {step === 'created' && 'Save your key now. It will not be shown again.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        {step !== 'created' && (
          <div className="flex gap-1">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  i <= stepIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        )}

        {/* Step: Basic Info */}
        {step === 'basic' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Production API Key"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="prefix">Prefix (optional)</Label>
              <Input
                id="prefix"
                placeholder="e.g., sk_live"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Custom prefix for the key. Defaults to &quot;sk&quot;.
              </p>
            </div>
            <div>
              <Label>Environment</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as Environment)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env.charAt(0).toUpperCase() + env.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expiration</Label>
              <Select value={expiresIn} onValueChange={setExpiresIn}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="24h">24 hours</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                  <SelectItem value="365d">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step: Scopes */}
        {step === 'scopes' && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Common Scopes</Label>
              <div className="grid grid-cols-2 gap-2">
                {COMMON_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={scopes.has(scope)}
                      onCheckedChange={() => toggleScope(scope)}
                    />
                    <code className="text-xs">{scope}</code>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Custom Scope</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., custom.scope"
                  value={customScope}
                  onChange={(e) => setCustomScope(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomScope();
                    }
                  }}
                />
                <Button variant="outline" onClick={addCustomScope}>
                  Add
                </Button>
              </div>
            </div>
            {scopes.size > 0 && (
              <div>
                <Label className="mb-2 block">Selected ({scopes.size})</Label>
                <div className="flex flex-wrap gap-1">
                  {Array.from(scopes).map((scope) => (
                    <Badge
                      key={scope}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => toggleScope(scope)}
                    >
                      {scope} &times;
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Rate Limiting */}
        {step === 'ratelimit' && (
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={rateLimitEnabled}
                onCheckedChange={(v) => setRateLimitEnabled(v as boolean)}
              />
              <span className="text-sm font-medium">Enable rate limiting</span>
            </label>

            {rateLimitEnabled && (
              <>
                <div>
                  <Label>Algorithm</Label>
                  <Select value={rlAlgorithm} onValueChange={(v) => setRlAlgorithm(v as RateLimitAlgorithm)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RATE_LIMIT_ALGORITHMS.map((algo) => (
                        <SelectItem key={algo} value={algo}>
                          {algo.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Limit (requests)</Label>
                    <Input
                      type="number"
                      value={rlLimit}
                      onChange={(e) => setRlLimit(e.target.value)}
                      min={1}
                    />
                  </div>
                  <div>
                    <Label>Window (seconds)</Label>
                    <Input
                      type="number"
                      value={rlWindow}
                      onChange={(e) => setRlWindow(e.target.value)}
                      min={1}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-4 text-sm">
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{name || 'Unnamed'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prefix</span>
                  <span className="font-medium">{prefix || 'sk (default)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Environment</span>
                  <Badge variant="secondary">{environment}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expiration</span>
                  <span className="font-medium">{expiresIn === 'never' ? 'Never' : expiresIn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scopes</span>
                  <span className="font-medium">{scopes.size || 'None (unrestricted)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate Limit</span>
                  <span className="font-medium">
                    {rateLimitEnabled ? `${rlLimit} req / ${rlWindow}s` : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Created */}
        {step === 'created' && createdKey && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/20">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This is the only time you will see this key. Store it securely.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-hidden break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
                {createdKey}
              </code>
              <Button variant="outline" size="icon" onClick={copyKey}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter>
          {step === 'created' ? (
            <Button onClick={() => handleClose(false)}>Done</Button>
          ) : (
            <div className="flex w-full justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  if (stepIndex === 0) handleClose(false);
                  else setStep(steps[stepIndex - 1]);
                }}
              >
                {stepIndex === 0 ? 'Cancel' : 'Back'}
              </Button>
              {step === 'review' ? (
                <Button onClick={handleCreate} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Key'}
                </Button>
              ) : (
                <Button onClick={() => setStep(steps[stepIndex + 1])}>Continue</Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
