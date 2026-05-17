'use client';

import { Clipboard } from 'lucide-react';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface AgentHandoff {
  id: string;
  title: string;
  summary: string;
  prompt_markdown: string;
  created_at: string;
}

export default function PlatformAgentHandoffPage() {
  const params = useParams();
  const id = params?.id as string;
  const [handoff, setHandoff] = React.useState<AgentHandoff | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const result = await apiClient<AgentHandoff>(`/api/v1/admin/copilot/agent-handoffs/${id}`);
        setHandoff(result);
      } catch (err: unknown) {
        console.error('[PlatformAgentHandoffPage.load]', err);
        toast.error('Failed to load repo-agent handoff.');
      }
    }
    void load();
  }, [id]);

  async function copyPrompt() {
    if (!handoff) return;
    try {
      await navigator.clipboard.writeText(handoff.prompt_markdown);
      toast.success('Prompt copied.');
    } catch (err: unknown) {
      console.error('[PlatformAgentHandoffPage.copyPrompt]', err);
      toast.error('Failed to copy prompt.');
    }
  }

  if (!handoff) {
    return <div className="py-10 text-sm text-text-secondary">Loading repo-agent handoff...</div>;
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title={handoff.title}
        description={`Created ${new Date(handoff.created_at).toLocaleString()}`}
        actions={
          <Button size="sm" variant="outline" onClick={() => void copyPrompt()}>
            <Clipboard className="me-1.5 h-3.5 w-3.5" />
            Copy prompt
          </Button>
        }
      />
      <section className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-text-secondary">{handoff.summary}</p>
        <textarea
          readOnly
          className="mt-4 h-[70vh] w-full rounded-md border border-border bg-surface-subtle p-3 font-mono text-xs text-text-primary"
          value={handoff.prompt_markdown}
        />
      </section>
    </div>
  );
}
