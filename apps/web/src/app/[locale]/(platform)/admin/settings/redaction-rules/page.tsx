'use client';

import { RefreshCw, Trash2 } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, Input, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface BuiltInRule {
  name: string;
  pattern: string;
  replacement: string;
}

interface CustomRule extends BuiltInRule {
  id: string;
  pattern_flags: string;
  severity: 'always' | 'warn';
  is_enabled: boolean;
}

interface RuleResponse {
  built_in: BuiltInRule[];
  custom: CustomRule[];
}

interface PreviewResponse {
  sample: string;
  redacted: string;
  rules_applied: string[];
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function RedactionRulesPage() {
  const [rules, setRules] = React.useState<RuleResponse>({ built_in: [], custom: [] });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const [form, setForm] = React.useState({
    name: '',
    pattern: '',
    pattern_flags: 'g',
    replacement: '[REDACTED]',
    severity: 'always',
    sample: '',
  });

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setRules(await apiClient<RuleResponse>('/api/v1/admin/platform-error-log/redaction-rules'));
    } catch (err: unknown) {
      console.error('[RedactionRulesPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load redaction rules.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function previewRule() {
    try {
      const result = await apiClient<PreviewResponse>(
        '/api/v1/admin/platform-error-log/redaction-rules/preview',
        { method: 'POST', body: JSON.stringify(form) },
      );
      setPreview(result);
    } catch (err: unknown) {
      console.error('[RedactionRulesPage.previewRule]', err);
      toast.error(getErrorMessage(err, 'Preview failed.'));
    }
  }

  async function createRule() {
    try {
      setSaving(true);
      await apiClient('/api/v1/admin/platform-error-log/redaction-rules', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({
        name: '',
        pattern: '',
        pattern_flags: 'g',
        replacement: '[REDACTED]',
        severity: 'always',
        sample: '',
      });
      setPreview(null);
      toast.success('Redaction rule created.');
      await load();
    } catch (err: unknown) {
      console.error('[RedactionRulesPage.createRule]', err);
      toast.error(getErrorMessage(err, 'Failed to create rule.'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id: string) {
    if (!window.confirm('Delete this custom redaction rule?')) return;
    try {
      await apiClient(`/api/v1/admin/platform-error-log/redaction-rules/${id}`, {
        method: 'DELETE',
      });
      toast.success('Redaction rule deleted.');
      await load();
    } catch (err: unknown) {
      console.error('[RedactionRulesPage.deleteRule]', err);
      toast.error(getErrorMessage(err, 'Failed to delete rule.'));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Redaction Rules"
        description="Built-in and custom regex rules applied before platform error persistence."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Create custom rule</h2>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Input
            value={form.name}
            placeholder="Rule name"
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <Input
            value={form.replacement}
            placeholder="Replacement"
            onChange={(event) =>
              setForm((current) => ({ ...current, replacement: event.target.value }))
            }
          />
          <Input
            value={form.pattern_flags}
            placeholder="Flags"
            onChange={(event) =>
              setForm((current) => ({ ...current, pattern_flags: event.target.value }))
            }
          />
          <select
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
            value={form.severity}
            onChange={(event) =>
              setForm((current) => ({ ...current, severity: event.target.value }))
            }
          >
            <option value="always">Always redact</option>
            <option value="warn">Warn</option>
          </select>
          <Textarea
            className="md:col-span-2"
            value={form.pattern}
            placeholder="Regex pattern"
            onChange={(event) =>
              setForm((current) => ({ ...current, pattern: event.target.value }))
            }
          />
          <Textarea
            className="md:col-span-2"
            value={form.sample}
            placeholder="Optional preview sample"
            onChange={(event) => setForm((current) => ({ ...current, sample: event.target.value }))}
          />
          <div className="flex gap-2 md:col-span-2">
            <Button variant="outline" type="button" onClick={() => void previewRule()}>
              Preview
            </Button>
            <Button type="button" disabled={saving} onClick={() => void createRule()}>
              Save rule
            </Button>
          </div>
          {preview ? (
            <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
              <pre className="overflow-auto rounded-md bg-background p-3 text-xs text-text-secondary">
                {preview.sample}
              </pre>
              <pre className="overflow-auto rounded-md bg-background p-3 text-xs text-text-secondary">
                {preview.redacted}
              </pre>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Built-in rules</h2>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <div className="p-4 text-sm text-text-secondary">Loading rules...</div>
          ) : (
            rules.built_in.map((rule) => (
              <div key={rule.name} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{rule.name}</span>
                  <Badge className="bg-success-bg text-success-text">Built-in</Badge>
                </div>
                <div className="mt-2 break-all font-mono text-xs text-text-secondary">
                  {rule.pattern}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Custom rules</h2>
        </div>
        <div className="divide-y divide-border">
          {rules.custom.length === 0 ? (
            <div className="p-4 text-sm text-text-secondary">No custom rules yet.</div>
          ) : (
            rules.custom.map((rule) => (
              <div key={rule.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-primary">{rule.name}</span>
                    <Badge className="bg-warning-bg text-warning-text">{rule.severity}</Badge>
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-text-secondary">
                    {rule.pattern}
                  </div>
                </div>
                <Button variant="outline" onClick={() => void deleteRule(rule.id)}>
                  <Trash2 className="me-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
