import { cookies } from 'next/headers';
import { Key, Activity, Coins, ShieldAlert, Plus, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { UsageChart } from './usage-chart';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  params: Promise<{ workspace: string }>;
}

async function fetchWorkspaceData(workspace: string, sessionToken: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const headers = { Cookie: `better-auth.session_token=${sessionToken}` };

  const [statsRes, activityRes, usageRes] = await Promise.allSettled([
    fetch(`${base}/v1/workspaces/${workspace}/stats`, { headers, cache: 'no-store' }),
    fetch(`${base}/v1/workspaces/${workspace}/audit-log?limit=10`, { headers, cache: 'no-store' }),
    fetch(`${base}/v1/workspaces/${workspace}/usage?period=7d`, { headers, cache: 'no-store' }),
  ]);

  const stats = statsRes.status === 'fulfilled' && statsRes.value.ok
    ? await statsRes.value.json().then((d: { data: unknown }) => d.data)
    : null;
  const activity = activityRes.status === 'fulfilled' && activityRes.value.ok
    ? await activityRes.value.json().then((d: { data: unknown }) => d.data)
    : null;
  const usage = usageRes.status === 'fulfilled' && usageRes.value.ok
    ? await usageRes.value.json().then((d: { data: unknown }) => d.data)
    : null;

  return { stats, activity, usage };
}

export default async function WorkspaceOverviewPage({ params }: Props) {
  const { workspace } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('better-auth.session_token')?.value || '';
  const { stats, activity, usage } = await fetchWorkspaceData(workspace, sessionToken);

  const statCards = [
    {
      title: 'Total Keys',
      value: stats?.totalKeys ?? '--',
      icon: Key,
      description: 'Active API keys',
      change: stats?.keysChange,
    },
    {
      title: 'Requests Today',
      value: stats?.requestsToday != null ? stats.requestsToday.toLocaleString() : '--',
      icon: Activity,
      description: 'API verifications',
      change: stats?.requestsChange,
    },
    {
      title: 'Tokens This Month',
      value: stats?.tokensThisMonth != null
        ? stats.tokensThisMonth >= 1_000_000
          ? `${(stats.tokensThisMonth / 1_000_000).toFixed(1)}M`
          : stats.tokensThisMonth.toLocaleString()
        : '--',
      icon: Coins,
      description: 'Total token usage',
      change: stats?.tokensChange,
    },
    {
      title: 'Active Rate Limits',
      value: stats?.activeRateLimits ?? '--',
      icon: ShieldAlert,
      description: 'Keys with rate limiting',
    },
  ];

  const activityEntries = (activity as Array<{
    id: string;
    action: string;
    actorType: string;
    resourceType: string | null;
    resourceId: string | null;
    timestamp: string;
  }>) || [];

  return (
    <div>
      <Header
        title="Overview"
        description={`Workspace dashboard for ${workspace}`}
        actions={
          <div className="flex gap-2">
            <Link href={`/${workspace}/keys`}>
              <Button variant="outline" size="sm">
                <BarChart3 className="mr-2 h-4 w-4" />
                View Usage
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

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.change != null && (
                    <span className={stat.change >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {stat.change >= 0 ? '+' : ''}{stat.change}%{' '}
                    </span>
                  )}
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Usage Chart */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Requests (Last 7 days)</CardTitle>
            <CardDescription>Daily API verification requests</CardDescription>
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
                <Button variant="outline" size="sm">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activityEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No activity yet. Create your first API key to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {activityEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-md border px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {entry.action}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {entry.resourceType && (
                          <span>{entry.resourceType} </span>
                        )}
                        {entry.resourceId && (
                          <code className="text-xs">{entry.resourceId.slice(0, 8)}...</code>
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
