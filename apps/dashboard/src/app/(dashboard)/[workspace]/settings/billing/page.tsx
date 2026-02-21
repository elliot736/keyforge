'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  CreditCard,
  ExternalLink,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { PLANS } from '@keyforge/shared';
import type { PlanName } from '@keyforge/shared';

interface BillingData {
  plan: PlanName;
  periodStart: string;
  periodEnd: string;
  usage: {
    keys: number;
    verifications: number;
    webhooks: number;
  };
  stripeCustomerId?: string;
  invoices: Array<{
    id: string;
    number: string;
    amount: number;
    status: string;
    date: string;
    url: string;
  }>;
}

const PLAN_PRICES: Record<PlanName, string> = {
  free: '$0/mo',
  pro: '$49/mo',
  enterprise: 'Custom',
};

export default function BillingPage() {
  const params = useParams();
  const workspace = params.workspace as string;

  const [billing, setBilling] = React.useState<BillingData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchBilling = async () => {
      try {
        const res = await fetch(`/api/proxy/workspaces/${workspace}/billing`);
        if (res.ok) {
          const data = await res.json();
          setBilling(data.data);
        }
      } catch {
        // Error silently handled
      } finally {
        setLoading(false);
      }
    };
    fetchBilling();
  }, [workspace]);

  const openPortal = async () => {
    try {
      const res = await fetch(`/api/proxy/workspaces/${workspace}/billing/portal`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        window.open(data.data?.url, '_blank');
      }
    } catch {
      // Error silently handled
    }
  };

  const handleUpgrade = async (plan: PlanName) => {
    try {
      const res = await fetch(`/api/proxy/workspaces/${workspace}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.url) window.location.href = data.data.url;
      }
    } catch {
      // Error silently handled
    }
  };

  const currentPlan = billing?.plan || 'free';
  const planConfig = PLANS[currentPlan];

  if (loading) {
    return (
      <div>
        <Skeleton className="mb-8 h-10 w-48" />
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Billing"
        description="Manage your subscription and billing"
      />

      {/* Navigation */}
      <div className="mb-6 flex gap-2">
        <Link href={`/${workspace}/settings`}>
          <Button variant="outline" size="sm">General</Button>
        </Link>
        <Link href={`/${workspace}/settings/members`}>
          <Button variant="outline" size="sm">
            <Users className="mr-2 h-4 w-4" />
            Members
          </Button>
        </Link>
        <Link href={`/${workspace}/settings/billing`}>
          <Button variant="default" size="sm">
            <CreditCard className="mr-2 h-4 w-4" />
            Billing
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>
              {billing?.periodStart && billing?.periodEnd
                ? `Billing period: ${format(new Date(billing.periodStart), 'MMM d')} - ${format(new Date(billing.periodEnd), 'MMM d, yyyy')}`
                : 'Current billing period'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold capitalize">{currentPlan}</h3>
                  <Badge>{PLAN_PRICES[currentPlan]}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {planConfig.maxKeys === -1
                    ? 'Unlimited keys'
                    : `Up to ${planConfig.maxKeys.toLocaleString()} keys`}
                  {' | '}
                  {planConfig.maxVerificationsPerMonth === -1
                    ? 'Unlimited verifications'
                    : `${(planConfig.maxVerificationsPerMonth / 1000).toFixed(0)}k verifications/mo`}
                </p>
              </div>
              {billing?.stripeCustomerId && (
                <Button variant="outline" onClick={openPortal}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage in Stripe
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Usage Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Usage This Period</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">API Keys</p>
                <p className="mt-1 text-2xl font-bold">
                  {billing?.usage.keys ?? 0}
                  <span className="text-sm font-normal text-muted-foreground">
                    {' '}/ {planConfig.maxKeys === -1 ? 'Unlimited' : planConfig.maxKeys}
                  </span>
                </p>
                {planConfig.maxKeys > 0 && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(((billing?.usage.keys ?? 0) / planConfig.maxKeys) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Verifications</p>
                <p className="mt-1 text-2xl font-bold">
                  {((billing?.usage.verifications ?? 0) / 1000).toFixed(1)}k
                  <span className="text-sm font-normal text-muted-foreground">
                    {' '}/ {planConfig.maxVerificationsPerMonth === -1
                      ? 'Unlimited'
                      : `${(planConfig.maxVerificationsPerMonth / 1000).toFixed(0)}k`}
                  </span>
                </p>
                {planConfig.maxVerificationsPerMonth > 0 && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(
                          ((billing?.usage.verifications ?? 0) / planConfig.maxVerificationsPerMonth) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Webhooks</p>
                <p className="mt-1 text-2xl font-bold">
                  {billing?.usage.webhooks ?? 0}
                  <span className="text-sm font-normal text-muted-foreground">
                    {' '}/ {planConfig.maxWebhooks === -1 ? 'Unlimited' : planConfig.maxWebhooks}
                  </span>
                </p>
                {planConfig.maxWebhooks > 0 && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(
                          ((billing?.usage.webhooks ?? 0) / planConfig.maxWebhooks) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plans Comparison */}
        {currentPlan !== 'enterprise' && (
          <Card>
            <CardHeader>
              <CardTitle>Upgrade Your Plan</CardTitle>
              <CardDescription>Get more keys, verifications, and features.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {(['pro', 'enterprise'] as PlanName[])
                  .filter((p) => p !== currentPlan)
                  .map((plan) => {
                    const config = PLANS[plan];
                    return (
                      <div key={plan} className="rounded-lg border p-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-bold capitalize">{plan}</h3>
                          <Badge variant="secondary">{PLAN_PRICES[plan]}</Badge>
                        </div>
                        <ul className="mt-4 space-y-2">
                          <li className="flex items-center gap-2 text-sm">
                            <Check className="h-4 w-4 text-emerald-600" />
                            {config.maxKeys === -1 ? 'Unlimited' : config.maxKeys.toLocaleString()} keys
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <Check className="h-4 w-4 text-emerald-600" />
                            {config.maxVerificationsPerMonth === -1
                              ? 'Unlimited'
                              : `${(config.maxVerificationsPerMonth / 1_000_000).toFixed(0)}M`}{' '}
                            verifications/mo
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <Check className="h-4 w-4 text-emerald-600" />
                            {config.maxWebhooks === -1 ? 'Unlimited' : config.maxWebhooks} webhooks
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <Check className="h-4 w-4 text-emerald-600" />
                            {config.auditRetentionDays === -1
                              ? 'Unlimited'
                              : `${config.auditRetentionDays} day`}{' '}
                            audit retention
                          </li>
                        </ul>
                        <Button
                          className="mt-4 w-full"
                          onClick={() => handleUpgrade(plan)}
                          variant={plan === 'enterprise' ? 'outline' : 'default'}
                        >
                          {plan === 'enterprise' ? 'Contact Sales' : 'Upgrade'}
                          <ArrowUpRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoices */}
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Download past invoices.</CardDescription>
          </CardHeader>
          <CardContent>
            {!billing?.invoices?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No invoices yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billing.invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.number}</TableCell>
                      <TableCell>{format(new Date(invoice.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>${(invoice.amount / 100).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={invoice.status === 'paid' ? 'success' : 'secondary'}
                        >
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <a
                          href={invoice.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
