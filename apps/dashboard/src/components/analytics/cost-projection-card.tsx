'use client';

import { DollarSign, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CostProjectionCardProps {
  currentMonthCostCents: number;
  projectedMonthCostCents: number;
  dailyAverageCostCents: number;
  daysRemaining: number;
  daysElapsed: number;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CostProjectionCard({
  currentMonthCostCents,
  projectedMonthCostCents,
  dailyAverageCostCents,
  daysRemaining,
  daysElapsed,
}: CostProjectionCardProps) {
  const totalDays = daysElapsed + daysRemaining;
  const progressPct = Math.round((daysElapsed / totalDays) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Cost Projection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Projected this month</p>
            <p className="text-2xl font-bold tracking-tight">
              {formatCurrency(projectedMonthCostCents)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Spent so far</p>
            <p className="text-lg font-semibold">{formatCurrency(currentMonthCostCents)}</p>
          </div>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Day {daysElapsed} of {totalDays}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            Daily average: <span className="font-medium">{formatCurrency(dailyAverageCostCents)}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
