'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Copy,
  RotateCw,
  Ban,
  Clock,
  Shield,
  Tag,
  Check,
  Activity,
  Coins,
  DollarSign,
  Zap,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { UsageChart } from '../../usage-chart';
import type { ApiKeyObject } from '@keyforge/shared';

export default function KeyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspace = params.workspace as string;
  const keyId = params.keyId as string;

  const [key, setKey] = React.useState<ApiKeyObject | null>(null);
  const [usage, setUsage] = React.useState<Array<{ date: string; requests: number }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [rotating, setRotating] = React.useState(false);
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const fetchKey = React.useCallback(async () => {
    try {
      const [keyRes, usageRes] = await Promise.all([
        fetch(`/api/proxy/workspaces/${workspace}/keys/${keyId}`),
        fetch(`/api/proxy/workspaces/${workspace}/keys/${keyId}/usage?period=7d`),
      ]);
      if (keyRes.ok) {
        const data = await keyRes.json();
        setKey(data.data);
      }
      if (usageRes.ok) {
        const data = await usageRes.json();
        setUsage(data.data || []);
      }
    } catch {
      // Error silently handled
    } finally {
      setLoading(false);
    }
  }, [workspace, keyId]);

  React.useEffect(() => {
    fetchKey();
  }, [fetchKey]);

  const handleRotate = async () => {
    if (!confirm('Rotate this key? The current key will stop working immediately.')) return;
    setRotating(true);
    try {
      const res = await fetch(`/api/proxy/workspaces/${workspace}/keys/${keyId}/rotate`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.data?.key || null);
        fetchKey();
      }
    } finally {
      setRotating(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this key? This action cannot be undone.')) return;
    const res = await fetch(`/api/proxy/workspaces/${workspace}/keys/${keyId}/revoke`, {
      method: 'POST',
    });
    if (res.ok) {
      fetchKey();
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const getStatus = (): { label: string; variant: 'success' | 'destructive' | 'warning' } => {
    if (key?.revokedAt) return { label: 'Revoked', variant: 'destructive' };
    if (key?.expiresAt && new Date(key.expiresAt) < new Date())
      return { label: 'Expired', variant: 'warning' };
    return { label: 'Active', variant: 'success' };
  };

  if (loading) {
    return (
      <div>
        <Skeleton className="mb-2 h-5 w-32" />
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!key) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Tag className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Key not found</h2>
        <p className="mt-2 text-muted-foreground">This key may have been deleted.</p>
        <Link href={`/${workspace}/keys`}>
          <Button className="mt-4" variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Keys
          </Button>
        </Link>
      </div>
    );
  }

  const status = getStatus();
  const totalRequests = usage.reduce((sum, d) => sum + d.requests, 0);

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/${workspace}/keys`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Keys
        </Link>
      </div>

      <Header
        title={key.name || 'Unnamed Key'}
        description={`Key ID: ${key.id}`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(key.id, 'id')}
            >
              {copied === 'id' ? (
                <Check className="mr-2 h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Copy ID
            </Button>
            {!key.revokedAt && (
              <>
                <Button variant="outline" size="sm" onClick={handleRotate} disabled={rotating}>
                  <RotateCw className={`mr-2 h-4 w-4 ${rotating ? 'animate-spin' : ''}`} />
                  Rotate
                </Button>
                <Button variant="destructive" size="sm" onClick={handleRevoke}>
                  <Ban className="mr-2 h-4 w-4" />
                  Revoke
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* New key banner */}
      {newKey && (
        <Card className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              New key generated. Copy it now - it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-hidden break-all rounded bg-background px-3 py-2 font-mono text-sm">
                {newKey}
              </code>
              <Button size="sm" onClick={() => copyToClipboard(newKey, 'newkey')}>
                {copied === 'newkey' ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Requests (7d)</p>
              <p className="text-lg font-bold">{totalRequests.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Coins className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Token Budget</p>
              <p className="text-lg font-bold">
                {key.tokenBudget != null
                  ? key.tokenBudget >= 1_000_000
                    ? `${(key.tokenBudget / 1_000_000).toFixed(1)}M`
                    : key.tokenBudget.toLocaleString()
                  : '\u221E'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Spend Cap</p>
              <p className="text-lg font-bold">
                {key.spendCapCents != null
                  ? `$${(key.spendCapCents / 100).toFixed(2)}`
                  : '\u221E'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={status.variant} className="mt-0.5">
                {status.label}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Key Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" />
              Key Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-y-4">
              <InfoField label="Name" value={key.name || 'Unnamed'} />
              <InfoField label="Prefix">
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{key.prefix}</code>
              </InfoField>
              <InfoField label="Environment">
                <Badge variant="secondary" className="mt-0.5">{key.environment}</Badge>
              </InfoField>
              <InfoField label="Owner ID">
                <span className="truncate font-mono text-sm">{key.ownerId || 'None'}</span>
              </InfoField>
              <InfoField
                label="Created"
                value={format(new Date(key.createdAt), 'MMM d, yyyy HH:mm')}
              />
              <InfoField
                label="Expires"
                value={key.expiresAt ? format(new Date(key.expiresAt), 'MMM d, yyyy HH:mm') : 'Never'}
              />
              <InfoField
                label="Last Used"
                value={
                  key.lastUsedAt
                    ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                    : 'Never'
                }
              />
              <InfoField label="Usage Count" value={(key as any).usageCount?.toLocaleString() ?? '0'} />
            </div>
          </CardContent>
        </Card>

        {/* Scopes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Scopes & Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {key.scopes.length === 0 ? (
              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No scopes configured. This key has unrestricted access.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {key.scopes.map((scope) => (
                  <Badge key={scope} variant="outline" className="font-mono text-xs">
                    {scope}
                  </Badge>
                ))}
              </div>
            )}

            <Separator className="my-4" />

            <div>
              <h4 className="mb-2 text-sm font-medium">Rate Limit Configuration</h4>
              {key.rateLimitConfig ? (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoField label="Algorithm">
                      <Badge variant="secondary" className="text-xs">
                        {key.rateLimitConfig.algorithm.replace(/_/g, ' ')}
                      </Badge>
                    </InfoField>
                    <InfoField
                      label="Limit"
                      value={`${key.rateLimitConfig.limit} req`}
                    />
                    <InfoField
                      label="Window"
                      value={`${key.rateLimitConfig.window / 1000}s`}
                    />
                    {key.rateLimitConfig.burstLimit && (
                      <InfoField
                        label="Burst"
                        value={String(key.rateLimitConfig.burstLimit)}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">No rate limiting configured.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model Policies */}
      {key.modelPolicies && Object.keys(key.modelPolicies).length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4" />
              Model Policies
            </CardTitle>
            <CardDescription>Per-model rate limits and budgets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(key.modelPolicies).map(([model, policy]) => (
                <div key={model} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <code className="text-sm font-medium">{model}</code>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {policy.tokenBudget && (
                      <span>Budget: <span className="font-medium text-foreground">{policy.tokenBudget.toLocaleString()} tokens</span></span>
                    )}
                    {policy.spendCapCents && (
                      <span>Cap: <span className="font-medium text-foreground">${(policy.spendCapCents / 100).toFixed(2)}</span></span>
                    )}
                    {policy.rateLimitMax && (
                      <span>Rate: <span className="font-medium text-foreground">{policy.rateLimitMax} req/{policy.rateLimitWindow ?? 60}s</span></span>
                    )}
                    {policy.blocked && (
                      <Badge variant="destructive" className="text-xs">Blocked</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Chart */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Usage (Last 7 days)
              </CardTitle>
              <CardDescription>Request volume for this key</CardDescription>
            </div>
            <Link href={`/${workspace}/usage`}>
              <Button variant="ghost" size="sm" className="text-xs">
                Full analytics
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <UsageChart data={usage} />
        </CardContent>
      </Card>

      {/* Metadata */}
      {key.meta && Object.keys(key.meta).length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-lg bg-muted/50 p-4 text-sm">
              {JSON.stringify(key.meta, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {children ?? <p className="mt-0.5 text-sm font-medium">{value}</p>}
    </div>
  );
}
