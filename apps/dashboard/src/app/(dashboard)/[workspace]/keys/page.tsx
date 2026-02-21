'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Plus, Search, MoreHorizontal, RotateCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { CreateKeyDialog } from '@/components/keys/create-key-dialog';
import { KeyActions } from '@/components/keys/key-actions';
import type { ApiKeyObject, Environment, KeyStatus } from '@keyforge/shared';

export default function KeysPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspace = params.workspace as string;
  const shouldOpenCreate = searchParams.get('create') === 'true';

  const [keys, setKeys] = React.useState<ApiKeyObject[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [envFilter, setEnvFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(shouldOpenCreate);
  const pageSize = 20;

  const fetchKeys = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));
      if (search) params.set('search', search);
      if (envFilter !== 'all') params.set('environment', envFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(
        `/api/proxy/workspaces/${workspace}/keys?${params}`
      );
      if (res.ok) {
        const data = await res.json();
        setKeys(data.data || []);
        setTotal(data.meta?.total || 0);
      }
    } catch {
      // Error silently handled
    } finally {
      setLoading(false);
    }
  }, [workspace, page, search, envFilter, statusFilter]);

  React.useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const totalPages = Math.ceil(total / pageSize);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === keys.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(keys.map((k) => k.id)));
    }
  };

  const handleBulkRevoke = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Revoke ${selectedIds.size} selected key(s)?`)) return;

    await Promise.all(
      Array.from(selectedIds).map((id) =>
        fetch(`/api/proxy/workspaces/${workspace}/keys/${id}/revoke`, {
          method: 'POST',
        })
      )
    );
    setSelectedIds(new Set());
    fetchKeys();
  };

  const getStatusBadge = (key: ApiKeyObject) => {
    if (key.revokedAt) return <Badge variant="destructive">Revoked</Badge>;
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) return <Badge variant="warning">Expired</Badge>;
    return <Badge variant="success">Active</Badge>;
  };

  const getEnvBadge = (env: Environment) => {
    const variants: Record<Environment, 'default' | 'secondary' | 'outline'> = {
      production: 'default',
      staging: 'secondary',
      development: 'outline',
    };
    return <Badge variant={variants[env]}>{env}</Badge>;
  };

  return (
    <div>
      <Header
        title="API Keys"
        description="Create and manage API keys for your workspace"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Key
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
                placeholder="Search keys by name or prefix..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex gap-2">
              <Select value={envFilter} onValueChange={(v) => { setEnvFilter(v); setPage(1); }}>
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
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-md bg-muted px-4 py-2">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button variant="destructive" size="sm" onClick={handleBulkRevoke}>
                Revoke Selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-3">
                <RotateCw className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No keys found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {search || envFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Create your first API key to get started.'}
              </p>
              {!search && envFilter === 'all' && statusFilter === 'all' && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Key
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === keys.length && keys.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(key.id)}
                          onCheckedChange={() => toggleSelect(key.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <a
                          href={`/${workspace}/keys/${key.id}`}
                          className="hover:underline"
                        >
                          {key.name || 'Unnamed'}
                        </a>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {key.prefix}...
                        </code>
                      </TableCell>
                      <TableCell>{getEnvBadge(key.environment)}</TableCell>
                      <TableCell>{getStatusBadge(key)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {key.scopes.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : key.scopes.length <= 2 ? (
                            key.scopes.map((s) => (
                              <Badge key={s} variant="outline" className="text-xs">
                                {s}
                              </Badge>
                            ))
                          ) : (
                            <>
                              <Badge variant="outline" className="text-xs">
                                {key.scopes[0]}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                +{key.scopes.length - 1} more
                              </Badge>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {key.lastUsedAt
                          ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <KeyActions
                          keyId={key.id}
                          workspace={workspace}
                          onAction={fetchKeys}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of{' '}
                    {total} keys
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

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspace={workspace}
        onCreated={fetchKeys}
      />
    </div>
  );
}
