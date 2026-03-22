import { cookies } from 'next/headers';
import {
  Key,
  Activity,
  Coins,
  ShieldAlert,
  Plus,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { UsageChart } from './usage-chart';
import { formatDistanceToNow } from 'date-fns';

interface WorkspaceStats {
  totalKeys: number;
  keysChange?: number;
  requestsToday: number;
  requestsChange?: number;
  tokensThisMonth: number;
  tokensChange?: number;
  activeRateLimits: number;
  successRate?: number;
  p50LatencyMs?: number;
  p99LatencyMs?: number;
}

interface Props {
  params: Promise<{ workspace: string }>;
}

async function fetchWorkspaceData(workspace: string, sessionToken: string) {
  const base = process.env.API_URL || 'http://localhost:4000';
  const headers = { Cookie: `better-auth.session_token=${sessionToken}` };

  const [statsRes, activityRes, usageRes] = await Promise.allSettled([
    fetch(`${base}/v1/workspaces/${workspace}/stats`, { headers, cache: 'no-store' }),
    fetch(`${base}/v1/workspaces/${workspace}/audit-log?limit=10`, { headers, cache: 'no-store' }),
    fetch(`${base}/v1/workspaces/${workspace}/usage?period=7d`, { headers, cache: 'no-store' }),
  ]);

  const stats = statsRes.status === 'fulfilled' && statsRes.value.ok
    ? await statsRes.value.json().then((d: { data: WorkspaceStats }) => d.data)
    : null;
  const activity = activityRes.status === 'fulfilled' && activityRes.value.ok
    ? await activityRes.value.json().then((d: { data: unknown }) => d.data)
    : null;
  const usage = usageRes.status === 'fulfilled' && usageRes.value.ok
    ? await usageRes.value.json().then((d: { data: unknown }) => d.data)
    : null;

  return { stats, activity, usage };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function ChangeIndicator({ change }: { change?: number }) {
  if (change == null) return null;
  const isPositive = change >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs font-medium ${
        isPositive
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-red-500/10 text-red-600 dark:text-red-400'
      }`}
    >
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingUp className="h-3 w-3 rotate-180" />}
      {Math.abs(change)}%
    </span>
  );
}

function getActionColor(action: string): 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline' {
  if (action.includes('create') || action.includes('add')) return 'success';
  if (action.includes('revoke') || action.includes('delete') || action.includes('remove')) return 'destructive';
  if (action.includes('update') || action.includes('rotate')) return 'warning';
  return 'secondary';
}

export default async function WorkspaceOverviewPage({ params }: Props) {
  const { workspace } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('better-auth.session_token')?.value || '';
  const { stats, activity, usage } = await fetchWorkspaceData(workspace, sessionToken);

  const activityEntries = (activity as Array<{
    id: string;
    action: string;
    actorType: string;
    resourceType: string | null;
    resourceId: string | null;
    timestamp: string;
  }>) || [];

  const successRate = stats?.successRate ?? null;

  return (
    <div>
      <Header
        title="Overview"
        description={`Workspace dashboard for ${workspace}`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </div>
            <Link href={`/${workspace}/usage`}>
              <Button variant="outline" size="sm">
                <BarChart3 className="mr-2 h-4 w-4" />
                Analytics
              </Button>
            </Link>
            <Link href={`/${workspace}/keys?create=true`}>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Key
              </Button>
            </Link>
          </div>
        }
      />

      {/* Primary Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Keys</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats?.totalKeys ?? '--'}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              <ChangeIndicator change={stats?.keysChange} />
              {' '}Active API keys
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Requests Today</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {stats?.requestsToday != null ? formatNumber(stats.requestsToday) : '--'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <ChangeIndicator change={stats?.requestsChange} />
              {' '}API verifications
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tokens This Month</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {stats?.tokensThisMonth != null ? formatNumber(stats.tokensThisMonth) : '--'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <ChangeIndicator change={stats?.tokensChange} />
              {' '}Total token usage
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rate Limits</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats?.activeRateLimits ?? '--'}</div>
            <p className="mt-1 text-xs text-muted-foreground">Keys with rate limiting</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary metrics bar */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Success Rate</p>
              <p className="text-lg font-bold tracking-tight">
                {successRate != null ? `${successRate.toFixed(1)}%` : '--'}
              </p>
            </div>
            {successRate != null && (
              <div className="ml-auto">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(successRate, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">p50 Latency</p>
              <p className="text-lg font-bold tracking-tight">
                {stats?.p50LatencyMs != null ? `${stats.p50LatencyMs}ms` : '--'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium">p99 Latency</p>
              <p className="text-lg font-bold tracking-tight">
                {stats?.p99LatencyMs != null ? `${stats.p99LatencyMs}ms` : '--'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Chart */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Requests (Last 7 days)</CardTitle>
                <CardDescription>Daily API verification requests</CardDescription>
              </div>
              <Link href={`/${workspace}/usage`}>
                <Button variant="ghost" size="sm" className="text-xs">
                  View details
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <UsageChart data={usage as Array<{ date: string; requests: number }> || []} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest audit log entries</CardDescription>
              </div>
              <Link href={`/${workspace}/audit`}>
                <Button variant="ghost" size="sm" className="text-xs">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activityEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Activity className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium">No activity yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create your first API key to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={getActionColor(entry.action)} className="font-mono text-xs">
                        {entry.action}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {entry.resourceType && (
                          <span className="font-medium text-foreground">{entry.resourceType}</span>
                        )}
                        {entry.resourceId && (
                          <code className="ml-1.5 rounded bg-muted px-1 py-0.5 text-xs">
                            {entry.resourceId.slice(0, 12)}...
                          </code>
                        )}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
