'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, RotateCw, Ban, Copy } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface KeyActionsProps {
  keyId: string;
  workspace: string;
  onAction: () => void;
}

export function KeyActions({ keyId, workspace, onAction }: KeyActionsProps) {
  const router = useRouter();
  const handleCopyId = () => {
    navigator.clipboard.writeText(keyId);
  };

  const handleRotate = async () => {
    if (!confirm('Rotate this key? The current key will stop working immediately.')) return;
    const res = await fetch(`/api/proxy/workspaces/${workspace}/keys/${keyId}/rotate`, {
      method: 'POST',
    });
    if (res.ok) onAction();
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this key? This action cannot be undone.')) return;
    const res = await fetch(`/api/proxy/workspaces/${workspace}/keys/${keyId}/revoke`, {
      method: 'POST',
    });
    if (res.ok) onAction();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.push(`/${workspace}/keys/${keyId}`)}>
          <Pencil className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyId}>
          <Copy className="mr-2 h-4 w-4" />
          Copy ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleRotate}>
          <RotateCw className="mr-2 h-4 w-4" />
          Rotate Key
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleRevoke} className="text-destructive">
          <Ban className="mr-2 h-4 w-4" />
          Revoke Key
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
