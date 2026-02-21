'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, CreditCard, AlertTriangle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

interface WorkspaceSettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
}

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspace = params.workspace as string;

  const [settings, setSettings] = React.useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [deleteConfirm, setDeleteConfirm] = React.useState('');

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`/api/proxy/workspaces/${workspace}`);
        if (res.ok) {
          const data = await res.json();
          setSettings(data.data);
          setName(data.data.name);
          setSlug(data.data.slug);
        }
      } catch {
        // Error silently handled
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [workspace]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/workspaces/${workspace}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.data);
        if (data.data.slug !== workspace) {
          router.push(`/${data.data.slug}/settings`);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== settings?.name) return;
    if (!confirm('Are you absolutely sure? This action cannot be undone.')) return;

    const res = await fetch(`/api/proxy/workspaces/${workspace}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      router.push('/');
    }
  };

  if (loading) {
    return (
      <div>
        <Skeleton className="mb-8 h-10 w-48" />
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Settings"
        description="Manage your workspace settings"
      />

      {/* Navigation */}
      <div className="mb-6 flex gap-2">
        <Link href={`/${workspace}/settings`}>
          <Button variant="default" size="sm">General</Button>
        </Link>
        <Link href={`/${workspace}/settings/members`}>
          <Button variant="outline" size="sm">
            <Users className="mr-2 h-4 w-4" />
            Members
          </Button>
        </Link>
        <Link href={`/${workspace}/settings/billing`}>
          <Button variant="outline" size="sm">
            <CreditCard className="mr-2 h-4 w-4" />
            Billing
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Workspace Details</CardTitle>
            <CardDescription>Update your workspace name and URL slug.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ws-slug">URL Slug</Label>
              <Input
                id="ws-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                This will change your workspace URL to /{slug}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t px-6 py-4">
            <p className="text-xs text-muted-foreground">
              Changes will apply immediately.
            </p>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        </Card>

        {/* Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Your workspace is on the following plan.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge className="text-lg capitalize">{settings?.plan || 'free'}</Badge>
              <Link href={`/${workspace}/settings/billing`}>
                <Button variant="outline" size="sm">
                  Upgrade Plan
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Permanently delete this workspace and all of its data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This action is irreversible. All API keys, usage data, webhooks, and audit logs will be permanently deleted.
            </p>
            <div>
              <Label htmlFor="delete-confirm">
                Type <strong>{settings?.name}</strong> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={settings?.name}
              />
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button
              variant="destructive"
              disabled={deleteConfirm !== settings?.name}
              onClick={handleDelete}
            >
              Delete Workspace
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
