'use client';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface ModelBreakdown {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costCents: number;
  requestCount: number;
  costPer1kTokens: number;
}

interface ModelBreakdownTableProps {
  data: ModelBreakdown[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ModelBreakdownTable({ data }: ModelBreakdownTableProps) {
  const totalCost = data.reduce((sum, d) => sum + d.costCents, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Model Cost Breakdown</CardTitle>
        <CardDescription>Token usage and cost by model</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No model usage data available
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Input Tokens</TableHead>
                <TableHead className="text-right">Output Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Cost/1K</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const pct = totalCost > 0 ? ((row.costCents / totalCost) * 100).toFixed(1) : '0';
                return (
                  <TableRow key={row.model}>
                    <TableCell className="font-medium font-mono text-sm">
                      {row.model}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.tokensInput)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.tokensOutput)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(row.costCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(Math.round(row.costPer1kTokens))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
