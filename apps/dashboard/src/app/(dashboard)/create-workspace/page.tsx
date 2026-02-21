'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function CreateWorkspacePage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setSlug(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        const workspaceSlug = data.data?.slug || slug.trim();
        router.push(`/${workspaceSlug}`);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.message || 'Failed to create workspace');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardHeader>
          <CardTitle>Create Workspace</CardTitle>
          <CardDescription>
            A workspace groups your API keys, usage, and team members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input
                id="ws-name"
                placeholder="e.g., My Project"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="ws-slug">Slug</Label>
              <Input
                id="ws-slug"
                placeholder="e.g., my-project"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                URL-friendly identifier. Auto-generated from name.
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={submitting || !name.trim() || !slug.trim()}>
              {submitting ? 'Creating...' : 'Create Workspace'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
