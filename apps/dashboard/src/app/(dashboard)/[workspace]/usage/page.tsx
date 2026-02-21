'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Activity, Coins, DollarSign, Timer } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface UsageData {
  requestsOverTime: Array<{ date: string; requests: number }>;
  tokensByModel: Array<{ model: string; tokens: number }>;
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalCostCents: number;
    avgLatencyMs: number;
  };
  topKeys: Array<{
    keyId: string;
    keyName: string;
    prefix: string;
    requests: number;
    tokens: number;
  }>;
}

export default function UsagePage() {
  const params = useParams();
  const workspace = params.workspace as string;

  const [period, setPeriod] = React.useState('7d');
  const [keyFilter, setKeyFilter] = React.useState('all');
  const [envFilter, setEnvFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<UsageData | null>(null);

  React.useEffect(() => {
    const fetchUsage = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ period });
        if (keyFilter !== 'all') params.set('keyId', keyFilter);
        if (envFilter !== 'all') params.set('environment', envFilter);

        const res = await fetch(
          `/api/proxy/workspaces/${workspace}/usage?${params}`
        );
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } catch {
        // Error silently handled
      } finally {
        setLoading(false);
      }
    };
    fetchUsage();
  }, [workspace, period, keyFilter, envFilter]);

  const summaryCards = [
    {
      title: 'Total Requests',
      value: data?.summary.totalRequests?.toLocaleString() ?? '--',
      icon: Activity,
    },
    {
      title: 'Total Tokens',
      value: data?.summary.totalTokens != null
        ? data.summary.totalTokens >= 1_000_000
          ? `${(data.summary.totalTokens / 1_000_000).toFixed(1)}M`
          : data.summary.totalTokens.toLocaleString()
        : '--',
      icon: Coins,
    },
    {
      title: 'Total Cost',
      value: data?.summary.totalCostCents != null
        ? `$${(data.summary.totalCostCents / 100).toFixed(2)}`
        : '--',
      icon: DollarSign,
    },
    {
      title: 'Avg Latency',
      value: data?.summary.avgLatencyMs != null
        ? `${data.summary.avgLatencyMs.toFixed(0)}ms`
        : '--',
      icon: Timer,
    },
  ];

  return (
    <div>
      <Header
        title="Usage"
        description="Monitor API usage and analytics"
      />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        <div className="flex gap-1 rounded-md border bg-background p-1">
          {['24h', '7d', '30d'].map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === '24h' ? 'Last 24h' : p === '7d' ? 'Last 7 days' : 'Last 30 days'}
            </Button>
          ))}
        </div>
        <Select value={envFilter} onValueChange={setEnvFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Environments</SelectItem>
            <SelectItem value="development">Development</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="production">Production</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Requests over time */}
        <Card>
          <CardHeader>
            <CardTitle>Requests Over Time</CardTitle>
            <CardDescription>API verification requests</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.requestsOverTime || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(221.2, 83.2%, 53.3%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(221.2, 83.2%, 53.3%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => {
                        try { return format(parseISO(v), 'MMM d'); } catch { return v; }
                      }}
                      tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)', fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(0, 0%, 100%)',
                        border: '1px solid hsl(214.3, 31.8%, 91.4%)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area type="monotone" dataKey="requests" stroke="hsl(221.2, 83.2%, 53.3%)" fill="url(#colorReq)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Token usage by model */}
        <Card>
          <CardHeader>
            <CardTitle>Token Usage by Model</CardTitle>
            <CardDescription>Token consumption breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.tokensByModel || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="model" tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)', fontSize: 12 }} />
                    <YAxis
                      tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)', fontSize: 12 }}
                      tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(0, 0%, 100%)',
                        border: '1px solid hsl(214.3, 31.8%, 91.4%)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="tokens" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Keys Table */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Top Keys by Usage</CardTitle>
          <CardDescription>Most active API keys in this period</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !data?.topKeys?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No usage data for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topKeys.map((key) => (
                  <TableRow key={key.keyId}>
                    <TableCell className="font-medium">
                      <a href={`/${workspace}/keys/${key.keyId}`} className="hover:underline">
                        {key.keyName || 'Unnamed'}
                      </a>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{key.prefix}</code>
                    </TableCell>
                    <TableCell className="text-right">{key.requests.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{key.tokens.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
