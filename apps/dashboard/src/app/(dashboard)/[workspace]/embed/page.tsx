'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Copy, Check, Code2, Eye } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export default function EmbedPage() {
  const params = useParams();
  const workspace = params.workspace as string;
  const [copiedSnippet, setCopiedSnippet] = React.useState<string | null>(null);
  const [portalDomain, setPortalDomain] = React.useState(
    typeof window !== 'undefined' ? window.location.origin : 'https://app.keyforge.dev'
  );

  const reactSnippet = `import { KeyForgePortal } from '@keyforge/react';

export function ApiKeyManager() {
  return (
    <KeyForgePortal
      workspaceId="${workspace}"
      apiUrl="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}"
      theme="auto"
      onKeyCreated={(key) => {
        console.log('New key created:', key.prefix);
      }}
    />
  );
}`;

  const iframeSnippet = `<iframe
  src="${portalDomain}/${workspace}/portal"
  width="100%"
  height="600"
  frameborder="0"
  style="border: 1px solid #e2e8f0; border-radius: 8px;"
></iframe>`;

  const scriptSnippet = `<div id="keyforge-portal"></div>
<script src="${portalDomain}/embed.js"></script>
<script>
  KeyForge.init({
    element: '#keyforge-portal',
    workspaceId: '${workspace}',
    apiUrl: '${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}',
    theme: 'auto',
  });
</script>`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <Button
      variant="outline"
      size="sm"
      className="absolute right-3 top-3"
      onClick={() => copyToClipboard(text, id)}
    >
      {copiedSnippet === id ? (
        <>
          <Check className="mr-1 h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3 w-3" />
          Copy
        </>
      )}
    </Button>
  );

  return (
    <div>
      <Header
        title="Embed"
        description="Embed an API key management portal in your application"
      />

      <Tabs defaultValue="react">
        <TabsList className="mb-6">
          <TabsTrigger value="react">React Component</TabsTrigger>
          <TabsTrigger value="iframe">iFrame</TabsTrigger>
          <TabsTrigger value="script">Script Tag</TabsTrigger>
        </TabsList>

        <TabsContent value="react">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  React Component
                </CardTitle>
                <CardDescription>
                  Install the <code className="rounded bg-muted px-1 py-0.5 text-xs">@keyforge/react</code> package
                  and use the portal component directly in your React application.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-2 block text-sm font-medium">1. Install the package</Label>
                  <div className="relative">
                    <pre className="overflow-auto rounded-md bg-zinc-950 p-4 text-sm text-zinc-50">
                      <code>npm install @keyforge/react</code>
                    </pre>
                    <CopyButton text="npm install @keyforge/react" id="install" />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium">2. Use the component</Label>
                  <div className="relative">
                    <pre className="overflow-auto rounded-md bg-zinc-950 p-4 text-sm text-zinc-50">
                      <code>{reactSnippet}</code>
                    </pre>
                    <CopyButton text={reactSnippet} id="react" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Configuration Options
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="pb-2 pr-4 text-left font-medium">Prop</th>
                        <th className="pb-2 pr-4 text-left font-medium">Type</th>
                        <th className="pb-2 pr-4 text-left font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="py-2 pr-4"><code className="text-xs">workspaceId</code></td>
                        <td className="py-2 pr-4"><Badge variant="outline">string</Badge></td>
                        <td className="py-2 text-muted-foreground">Your workspace slug or ID</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4"><code className="text-xs">apiUrl</code></td>
                        <td className="py-2 pr-4"><Badge variant="outline">string</Badge></td>
                        <td className="py-2 text-muted-foreground">KeyForge API endpoint</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4"><code className="text-xs">theme</code></td>
                        <td className="py-2 pr-4"><Badge variant="outline">&quot;light&quot; | &quot;dark&quot; | &quot;auto&quot;</Badge></td>
                        <td className="py-2 text-muted-foreground">Color scheme</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4"><code className="text-xs">onKeyCreated</code></td>
                        <td className="py-2 pr-4"><Badge variant="outline">function</Badge></td>
                        <td className="py-2 text-muted-foreground">Callback when a key is created</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4"><code className="text-xs">onKeyRevoked</code></td>
                        <td className="py-2 pr-4"><Badge variant="outline">function</Badge></td>
                        <td className="py-2 text-muted-foreground">Callback when a key is revoked</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="iframe">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>iFrame Embed</CardTitle>
                <CardDescription>
                  Embed the key management portal using a simple iFrame. Works with any website or framework.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-2 block text-sm font-medium">Embed Code</Label>
                  <div className="relative">
                    <pre className="overflow-auto rounded-md bg-zinc-950 p-4 text-sm text-zinc-50">
                      <code>{iframeSnippet}</code>
                    </pre>
                    <CopyButton text={iframeSnippet} id="iframe" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-lg border bg-white">
                  <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-yellow-400" />
                    <div className="h-3 w-3 rounded-full bg-green-400" />
                    <span className="ml-2 text-xs text-muted-foreground">your-app.com</span>
                  </div>
                  <div className="p-6">
                    <div className="rounded-lg border bg-muted/30 p-8 text-center">
                      <Code2 className="mx-auto h-10 w-10 text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium">KeyForge Portal</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        The embedded key management interface will appear here.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="script">
          <Card>
            <CardHeader>
              <CardTitle>Script Tag</CardTitle>
              <CardDescription>
                Add the KeyForge embed script to any HTML page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="overflow-auto rounded-md bg-zinc-950 p-4 text-sm text-zinc-50">
                  <code>{scriptSnippet}</code>
                </pre>
                <CopyButton text={scriptSnippet} id="script" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
