'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Plus, Webhook, RotateCw, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { WEBHOOK_EVENTS } from '@keyforge/shared';
import type { WebhookObject } from '@keyforge/shared';

interface WebhookWithDeliveries extends WebhookObject {
  lastDeliveryAt?: string;
  lastDeliveryStatus?: number;
}

interface Delivery {
  id: string;
  webhookId: string;
  event: string;
  statusCode: number;
  success: boolean;
  duration: number;
  timestamp: string;
}

export default function WebhooksPage() {
  const params = useParams();
  const workspace = params.workspace as string;

  const [webhooks, setWebhooks] = React.useState<WebhookWithDeliveries[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedWebhook, setSelectedWebhook] = React.useState<string | null>(null);
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = React.useState(false);

  // Create form state
  const [newUrl, setNewUrl] = React.useState('');
  const [newEvents, setNewEvents] = React.useState<Set<string>>(new Set());
  const [creating, setCreating] = React.useState(false);

  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchWebhooks = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/v1/workspaces/${workspace}/webhooks`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.data || []);
      }
    } catch {
      // Error silently handled
    } finally {
      setLoading(false);
    }
  }, [base, workspace]);

  React.useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const fetchDeliveries = async (webhookId: string) => {
    setSelectedWebhook(webhookId);
    setDeliveriesLoading(true);
    try {
      const res = await fetch(
        `${base}/v1/workspaces/${workspace}/webhooks/${webhookId}/deliveries`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.data || []);
      }
    } catch {
      // Error silently handled
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newUrl || newEvents.size === 0) return;
    setCreating(true);
    try {
      const res = await fetch(`${base}/v1/workspaces/${workspace}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: newUrl, events: Array.from(newEvents) }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setNewUrl('');
        setNewEvents(new Set());
        fetchWebhooks();
      }
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`${base}/v1/workspaces/${workspace}/webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active }),
    });
    fetchWebhooks();
  };

  const handleRetry = async (deliveryId: string) => {
    if (!selectedWebhook) return;
    await fetch(
      `${base}/v1/workspaces/${workspace}/webhooks/${selectedWebhook}/deliveries/${deliveryId}/retry`,
      { method: 'POST', credentials: 'include' }
    );
    fetchDeliveries(selectedWebhook);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook endpoint?')) return;
    await fetch(`${base}/v1/workspaces/${workspace}/webhooks/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (selectedWebhook === id) setSelectedWebhook(null);
    fetchWebhooks();
  };

  return (
    <div>
      <Header
        title="Webhooks"
        description="Receive real-time notifications for events in your workspace"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Webhook
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-3">
              <Webhook className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No webhooks configured</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a webhook endpoint to receive event notifications.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Webhook List */}
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <Card
                key={webhook.id}
                className={`cursor-pointer transition-colors ${
                  selectedWebhook === webhook.id ? 'border-primary' : ''
                }`}
                onClick={() => fetchDeliveries(webhook.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <code className="truncate text-sm font-medium">{webhook.url}</code>
                        <Badge variant={webhook.active ? 'success' : 'secondary'}>
                          {webhook.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {webhook.events.map((event) => (
                          <Badge key={event} variant="outline" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Created {formatDistanceToNow(new Date(webhook.createdAt), { addSuffix: true })}
                        {webhook.lastDeliveryAt && (
                          <>
                            {' '}· Last delivery{' '}
                            {formatDistanceToNow(new Date(webhook.lastDeliveryAt), {
                              addSuffix: true,
                            })}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={webhook.active}
                        onCheckedChange={(checked) => toggleActive(webhook.id, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(webhook.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Delivery History */}
          <Card>
            <CardHeader>
              <CardTitle>Delivery History</CardTitle>
              <CardDescription>
                {selectedWebhook
                  ? 'Recent webhook deliveries'
                  : 'Select a webhook to view deliveries'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedWebhook ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Click a webhook endpoint to view its delivery history.
                </p>
              ) : deliveriesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : deliveries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No deliveries yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {deliveries.map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            delivery.success ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {delivery.event}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {delivery.statusCode}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(delivery.timestamp), {
                              addSuffix: true,
                            })}
                            {' '}· {delivery.duration}ms
                          </p>
                        </div>
                      </div>
                      {!delivery.success && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(delivery.id)}
                        >
                          <RotateCw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Webhook Endpoint</DialogTitle>
            <DialogDescription>
              Configure a URL to receive webhook event notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                placeholder="https://example.com/webhooks"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-2 block">Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <label
                    key={event}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={newEvents.has(event)}
                      onCheckedChange={() => {
                        setNewEvents((prev) => {
                          const next = new Set(prev);
                          if (next.has(event)) next.delete(event);
                          else next.add(event);
                          return next;
                        });
                      }}
                    />
                    <code className="text-xs">{event}</code>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newUrl || newEvents.size === 0 || creating}
            >
              {creating ? 'Creating...' : 'Create Webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
