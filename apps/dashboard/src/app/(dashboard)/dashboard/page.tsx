'use client';

import { useSession } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Key, Activity, Shield, TrendingUp } from 'lucide-react';

const stats = [
  {
    title: 'Total API Keys',
    value: '12',
    description: '3 created this month',
    icon: Key,
  },
  {
    title: 'Total Requests',
    value: '45,231',
    description: '+12.5% from last month',
    icon: Activity,
  },
  {
    title: 'Active Keys',
    value: '8',
    description: '4 keys revoked',
    icon: Shield,
  },
  {
    title: 'Avg. Daily Usage',
    value: '1,508',
    description: '+4.1% from last week',
    icon: TrendingUp,
  },
];

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back, {session?.user?.name || 'User'}. Here&apos;s an overview
          of your API usage.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { action: 'API key created', key: 'sk_live_...a3f2', time: '2 hours ago' },
                { action: 'API key used', key: 'sk_live_...b1c4', time: '4 hours ago' },
                { action: 'API key revoked', key: 'sk_test_...d5e6', time: '1 day ago' },
                { action: 'API key created', key: 'sk_test_...f7g8', time: '2 days ago' },
                { action: 'Settings updated', key: 'Account', time: '3 days ago' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.action}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.key}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.time}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <a
                href="/keys"
                className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent"
              >
                <Key className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Create new API key
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Generate a new key for your application
                  </p>
                </div>
              </a>
              <a
                href="/settings"
                className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent"
              >
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Security settings
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Update your password and security preferences
                  </p>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
