'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Key, Copy, Trash2, Plus, Eye, EyeOff } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt: string | null;
}

const mockKeys: ApiKey[] = [
  {
    id: '1',
    name: 'Production App',
    prefix: 'sk_live_...a3f2',
    status: 'active',
    createdAt: '2024-12-01',
    lastUsedAt: '2024-12-15',
  },
  {
    id: '2',
    name: 'Staging Environment',
    prefix: 'sk_test_...b1c4',
    status: 'active',
    createdAt: '2024-11-20',
    lastUsedAt: '2024-12-14',
  },
  {
    id: '3',
    name: 'Old Integration',
    prefix: 'sk_test_...d5e6',
    status: 'revoked',
    createdAt: '2024-10-01',
    lastUsedAt: '2024-11-30',
  },
];

export default function KeysPage() {
  const [keys] = useState<ApiKey[]>(mockKeys);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    // In production, this would call the API
    const fakeKey = `sk_live_${Math.random().toString(36).substring(2, 34)}`;
    setCreatedKey(fakeKey);
    setNewKeyName('');
  }

  function handleCopyKey(key: string) {
    navigator.clipboard.writeText(key);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            API Keys
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage your API keys for authentication.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Create key
        </Button>
      </div>

      {showCreateForm && (
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle className="text-base">Create new API key</CardTitle>
            <CardDescription>
              Give your key a descriptive name to remember what it&apos;s used
              for.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {createdKey ? (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-muted/50 p-4">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    Your new API key:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-sm">
                      {showKey ? createdKey : createdKey.replace(/./g, '*')}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyKey(createdKey)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Make sure to copy your key now. You won&apos;t be able to see
                    it again.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreatedKey(null);
                    setShowCreateForm(false);
                  }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleCreateKey} className="flex gap-3">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production App"
                  required
                  className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Button type="submit">Generate</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your API keys</CardTitle>
          <CardDescription>
            Keys are used to authenticate requests to the KeyForge API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-md border border-border p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                    <Key className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {key.name}
                      </p>
                      <Badge
                        variant={
                          key.status === 'active' ? 'default' : 'secondary'
                        }
                      >
                        {key.status}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {key.prefix}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {key.lastUsedAt
                      ? `Last used ${key.lastUsedAt}`
                      : 'Never used'}
                  </span>
                  {key.status === 'active' && (
                    <Button variant="ghost" size="icon" title="Revoke key">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {keys.length === 0 && (
              <div className="py-8 text-center">
                <Key className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No API keys yet. Create one to get started.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
