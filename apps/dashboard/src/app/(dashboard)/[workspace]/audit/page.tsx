'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Search, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import type { AuditLogEntry } from '@keyforge/shared';

export default function AuditLogPage() {
  const params = useParams();
  const workspace = params.workspace as string;

  const [entries, setEntries] = React.useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [actionFilter, setActionFilter] = React.useState('all');
  const [actorFilter, setActorFilter] = React.useState('all');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 25;

  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchEntries = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));
      if (search) params.set('search', search);
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (actorFilter !== 'all') params.set('actorType', actorFilter);

      const res = await fetch(
        `${base}/v1/workspaces/${workspace}/audit-log?${params}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setEntries(data.data || []);
        setTotal(data.meta?.total || 0);
      }
    } catch {
      // Error silently handled
    } finally {
      setLoading(false);
    }
  }, [base, workspace, page, search, actionFilter, actorFilter]);

  React.useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleExport = async () => {
    try {
      const res = await fetch(
        `${base}/v1/workspaces/${workspace}/audit-log/export`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${workspace}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Error silently handled
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const getActionColor = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (action.includes('revoke') || action.includes('delete')) return 'destructive';
    if (action.includes('create')) return 'default';
    if (action.includes('update') || action.includes('rotate')) return 'secondary';
    return 'outline';
  };

  const renderDiff = (before: Record<string, unknown> | null, after: Record<string, unknown> | null) => {
    if (!before && !after) return <p className="text-sm text-muted-foreground">No details available.</p>;

    const allKeys = new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);

    return (
      <div className="grid gap-2 lg:grid-cols-2">
        {before && (
          <div>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Before</h4>
            <pre className="overflow-auto rounded bg-red-50 p-3 text-xs dark:bg-red-950/20">
              {JSON.stringify(before, null, 2)}
            </pre>
          </div>
        )}
        {after && (
          <div>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">After</h4>
            <pre className="overflow-auto rounded bg-emerald-50 p-3 text-xs dark:bg-emerald-950/20">
              {JSON.stringify(after, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <Header
        title="Audit Log"
        description="Track all actions performed in your workspace"
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search audit log..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex gap-2">
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="key.create">Key Created</SelectItem>
                  <SelectItem value="key.revoke">Key Revoked</SelectItem>
                  <SelectItem value="key.rotate">Key Rotated</SelectItem>
                  <SelectItem value="key.update">Key Updated</SelectItem>
                  <SelectItem value="webhook.create">Webhook Created</SelectItem>
                  <SelectItem value="webhook.delete">Webhook Deleted</SelectItem>
                  <SelectItem value="member.invite">Member Invited</SelectItem>
                  <SelectItem value="member.remove">Member Removed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actorFilter} onValueChange={(v) => { setActorFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Actor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actors</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="root_key">Root Key</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No audit log entries found.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <React.Fragment key={entry.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setExpandedId(expandedId === entry.id ? null : entry.id)
                        }
                      >
                        <TableCell>
                          {expandedId === entry.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <div>
                            {format(new Date(entry.timestamp), 'MMM d, HH:mm:ss')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {entry.actorType}
                          </Badge>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {entry.actorId.slice(0, 12)}...
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionColor(entry.action)}>
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {entry.resourceType && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">{entry.resourceType}</span>
                              {entry.resourceId && (
                                <code className="ml-1 text-xs">
                                  {entry.resourceId.slice(0, 8)}...
                                </code>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.ipAddress || '--'}
                        </TableCell>
                      </TableRow>
                      {expandedId === entry.id && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30 p-4">
                            {renderDiff(entry.before, entry.after)}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} to{' '}
                    {Math.min(page * pageSize, total)} of {total} entries
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
