'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronsUpDown, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const params = useParams();
  const currentSlug = params.workspace as string;
  const [open, setOpen] = React.useState(false);
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [loading, setLoading] = React.useState(true);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/v1/workspaces`, {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        setWorkspaces(data.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const currentWorkspace = workspaces.find((w) => w.slug === currentSlug);

  if (loading) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        <div className="flex items-center gap-2 truncate">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
            {(currentWorkspace?.name || 'W')[0].toUpperCase()}
          </div>
          <span className="truncate font-medium">
            {currentWorkspace?.name || 'Select workspace'}
          </span>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[220px] overflow-hidden rounded-md border bg-popover p-1 shadow-md">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Workspaces
          </div>
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                workspace.slug === currentSlug && 'bg-accent'
              )}
              onClick={() => {
                router.push(`/${workspace.slug}`);
                setOpen(false);
              }}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
                {workspace.name[0].toUpperCase()}
              </div>
              <span className="truncate">{workspace.name}</span>
              {workspace.slug === currentSlug && (
                <Check className="ml-auto h-4 w-4" />
              )}
            </button>
          ))}
          <div className="-mx-1 my-1 h-px bg-border" />
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              router.push('/create-workspace');
              setOpen(false);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Create workspace</span>
          </button>
        </div>
      )}
    </div>
  );
}
