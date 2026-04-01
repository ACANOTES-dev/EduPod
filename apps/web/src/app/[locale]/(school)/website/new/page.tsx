'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewWebsitePagePage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [saving, setSaving] = React.useState(false);

  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugManual, setSlugManual] = React.useState(false);
  const [pageType, setPageType] = React.useState('custom');
  const [metaTitle, setMetaTitle] = React.useState('');
  const [metaDescription, setMetaDescription] = React.useState('');
  const [bodyHtml, setBodyHtml] = React.useState('');
  const [showInNav, setShowInNav] = React.useState(false);
  const [navOrder, setNavOrder] = React.useState<number>(0);

  // Auto-generate slug from title
  React.useEffect(() => {
    if (!slugManual && title) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  const handleSlugChange = (value: string) => {
    setSlugManual(true);
    setSlug(slugify(value));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!slug.trim()) {
      toast.error('Slug is required');
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/website/pages', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          page_type: pageType,
          meta_title: metaTitle.trim() || undefined,
          meta_description: metaDescription.trim() || undefined,
          body_html: bodyHtml,
          show_in_nav: showInNav,
          nav_order: showInNav ? navOrder : undefined,
          status: 'draft',
        }),
      });
      toast.success('Page saved as draft');
      router.push(`/${locale}/website/${res.data.id}`);
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'error' in err
          ? String((err as { error: { message?: string } }).error?.message ?? 'Failed to save page')
          : 'Failed to save page';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Website Page"
        description="Create a new page for your public school website"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/${locale}/website`)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save as Draft'}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Basic info */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Page Details</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Title <span className="text-error-text">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. About Our School"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">
                  Slug <span className="text-error-text">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-tertiary">/</span>
                  <Input
                    id="slug"
                    dir="ltr"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="about-our-school"
                    className="font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-text-tertiary">This will be the URL path for the page</p>
              </div>

              <div className="space-y-1.5">
                <Label>Page Type</Label>
                <Select value={pageType} onValueChange={setPageType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="about">About</SelectItem>
                    <SelectItem value="admissions">Admissions</SelectItem>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Body content */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Page Content</h2>
            <div className="space-y-1.5">
              <Label htmlFor="body_html">Body HTML</Label>
              <Textarea
                id="body_html"
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="<p>Enter your page content here...</p>"
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-text-tertiary">HTML content rendered on the public page</p>
            </div>
          </div>

          {/* SEO */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">SEO Settings</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="meta_title">Meta Title</Label>
                <Input
                  id="meta_title"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder="Leave blank to use page title"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta_description">Meta Description</Label>
                <Textarea
                  id="meta_description"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="Brief description for search engines (150–160 characters)"
                  className="min-h-[80px]"
                />
                <p className="text-xs text-text-tertiary">
                  {metaDescription.length} / 160 characters
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Navigation</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Show in Navigation</p>
                  <p className="text-xs text-text-tertiary">Display this page in the site menu</p>
                </div>
                <Switch checked={showInNav} onCheckedChange={setShowInNav} />
              </div>

              {showInNav && (
                <div className="space-y-1.5">
                  <Label htmlFor="nav_order">Navigation Order</Label>
                  <Input
                    id="nav_order"
                    type="number"
                    dir="ltr"
                    min={0}
                    value={navOrder}
                    onChange={(e) => setNavOrder(Number(e.target.value))}
                  />
                  <p className="text-xs text-text-tertiary">Lower numbers appear first</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Status</h2>
            <div className="rounded-lg bg-surface-secondary px-3 py-2">
              <span className="text-sm font-medium text-text-secondary">Draft</span>
              <p className="mt-0.5 text-xs text-text-tertiary">
                Save as draft — publish from the edit page
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
