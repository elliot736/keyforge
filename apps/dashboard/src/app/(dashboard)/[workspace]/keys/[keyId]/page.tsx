'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Copy,
  RotateCw,
  Ban,
  Pencil,
  Clock,
  Shield,
  Tag,
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!key) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-xl font-semibold">Key not found</h2>
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

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/${workspace}/keys`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(key.id)}>
              <Copy className="mr-2 h-4 w-4" />
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
              <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-sm">
                {newKey}
              </code>
              <Button size="sm" onClick={() => copyToClipboard(newKey)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Key Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Key Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{key.name || 'Unnamed'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prefix</p>
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{key.prefix}</code>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Environment</p>
                <Badge variant="secondary" className="mt-1">
                  {key.environment}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={status.variant} className="mt-1">
                  {status.label}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-sm">{format(new Date(key.createdAt), 'MMM d, yyyy HH:mm')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expires</p>
                <p className="text-sm">
                  {key.expiresAt
                    ? format(new Date(key.expiresAt), 'MMM d, yyyy HH:mm')
                    : 'Never'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Used</p>
                <p className="text-sm">
                  {key.lastUsedAt
                    ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                    : 'Never'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Owner ID</p>
                <p className="truncate text-sm font-mono">
                  {key.ownerId || 'None'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Token Budget</p>
                <p className="text-sm">
                  {key.tokenBudget != null
                    ? `${key.tokenBudget.toLocaleString()} tokens`
                    : 'Unlimited'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Spend Cap</p>
                <p className="text-sm">
                  {key.spendCapCents != null
                    ? `$${(key.spendCapCents / 100).toFixed(2)}`
                    : 'Unlimited'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scopes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Scopes & Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {key.scopes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scopes configured. This key has unrestricted access.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {key.scopes.map((scope) => (
                  <Badge key={scope} variant="outline">
                    {scope}
                  </Badge>
                ))}
              </div>
            )}

            <Separator className="my-4" />

            <div>
              <h4 className="mb-2 text-sm font-medium">Rate Limit Configuration</h4>
              {key.rateLimitConfig ? (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Algorithm: </span>
                      <span className="font-medium">{key.rateLimitConfig.algorithm}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Limit: </span>
                      <span className="font-medium">{key.rateLimitConfig.limit} req</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Window: </span>
                      <span className="font-medium">{key.rateLimitConfig.window / 1000}s</span>
                    </div>
                    {key.rateLimitConfig.burstLimit && (
                      <div>
                        <span className="text-muted-foreground">Burst: </span>
                        <span className="font-medium">{key.rateLimitConfig.burstLimit}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No rate limiting configured.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Chart */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Usage (Last 7 days)
          </CardTitle>
          <CardDescription>Request volume for this key</CardDescription>
        </CardHeader>
        <CardContent>
          <UsageChart data={usage} />
        </CardContent>
      </Card>

      {/* Metadata */}
      {key.meta && Object.keys(key.meta).length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted p-4 text-sm">
              {JSON.stringify(key.meta, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
