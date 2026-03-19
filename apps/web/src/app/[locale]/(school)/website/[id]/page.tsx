'use client';

import { Eye, Trash2 } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebsitePage {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  status: string;
  meta_title: string | null;
  meta_description: string | null;
  body_html: string | null;
  show_in_nav: boolean;
  nav_order: number | null;
  published_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary'> = {
    published: 'default',
    draft: 'secondary',
    archived: 'secondary',
  };
  return (
    <Badge variant={variants[status] ?? 'secondary'} className="text-xs capitalize">
      {status}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebsitePageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [page, setPage] = React.useState<WebsitePage | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = React.useState(false);

  // Form state
  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [metaTitle, setMetaTitle] = React.useState('');
  const [metaDescription, setMetaDescription] = React.useState('');
  const [bodyHtml, setBodyHtml] = React.useState('');
  const [showInNav, setShowInNav] = React.useState(false);
  const [navOrder, setNavOrder] = React.useState<number>(0);

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiClient<{ data: WebsitePage }>(`/api/v1/website/pages/${id}`)
      .then((res) => {
        const p = res.data;
        setPage(p);
        setTitle(p.title);
        setSlug(p.slug);
        setMetaTitle(p.meta_title ?? '');
        setMetaDescription(p.meta_description ?? '');
        setBodyHtml(p.body_html ?? '');
        setShowInNav(p.show_in_nav);
        setNavOrder(p.nav_order ?? 0);
      })
      .catch(() => {
        toast.error('Failed to load page');
        router.push(`/${locale}/website`);
      })
      .finally(() => setLoading(false));
  }, [id, locale, router]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient<{ data: WebsitePage }>(`/api/v1/website/pages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          meta_title: metaTitle.trim() || null,
          meta_description: metaDescription.trim() || null,
          body_html: bodyHtml,
          show_in_nav: showInNav,
          nav_order: showInNav ? navOrder : null,
        }),
      });
      setPage(res.data);
      toast.success('Page saved');
    } catch {
      toast.error('Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await apiClient<{ data: WebsitePage }>(`/api/v1/website/pages/${id}/publish`, {
        method: 'POST',
      });
      setPage(res.data);
      toast.success('Page published');
    } catch {
      toast.error('Failed to publish page');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setPublishing(true);
    try {
      const res = await apiClient<{ data: WebsitePage }>(`/api/v1/website/pages/${id}/unpublish`, {
        method: 'POST',
      });
      setPage(res.data);
      toast.success('Page unpublished');
    } catch {
      toast.error('Failed to unpublish page');
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient(`/api/v1/website/pages/${id}`, { method: 'DELETE' });
      toast.success('Page deleted');
      router.push(`/${locale}/website`);
    } catch {
      toast.error('Failed to delete page');
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!page) return null;

  const pageTypeLabel = {
    home: 'Home',
    about: 'About',
    admissions: 'Admissions',
    contact: 'Contact',
    custom: 'Custom',
  }[page.page_type] ?? page.page_type;

  return (
    <div className="space-y-6">
      <PageHeader
        title={page.title}
        description={`/${page.slug} · ${pageTypeLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={page.status} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowPreviewDialog(true)}
              aria-label="Preview"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => router.push(`/${locale}/website`)}>
              Back
            </Button>
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            {page.status === 'published' ? (
              <Button variant="outline" onClick={handleUnpublish} disabled={publishing}>
                {publishing ? 'Updating...' : 'Unpublish'}
              </Button>
            ) : (
              <Button onClick={handlePublish} disabled={publishing}>
                {publishing ? 'Publishing...' : 'Publish'}
              </Button>
            )}
            <Button
              variant="destructive"
              size="icon"
              onClick={() => setShowDeleteDialog(true)}
              aria-label="Delete page"
            >
              <Trash2 className="h-4 w-4" />
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
                />
              </div>

              <div className="space-y-1.5">
                <Label>Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-tertiary">/</span>
                  <Input
                    dir="ltr"
                    value={slug}
                    readOnly
                    className="font-mono text-sm text-text-tertiary"
                  />
                </div>
                <p className="text-xs text-text-tertiary">Slug cannot be changed after creation</p>
              </div>

              <div className="space-y-1.5">
                <Label>Page Type</Label>
                <div className="rounded-lg bg-surface-secondary px-3 py-2">
                  <span className="text-sm font-medium text-text-secondary capitalize">{pageTypeLabel}</span>
                </div>
                <p className="text-xs text-text-tertiary">Page type is fixed after creation</p>
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
                  placeholder="Brief description for search engines"
                  className="min-h-[80px]"
                />
                <p className="text-xs text-text-tertiary">{metaDescription.length} / 160 characters</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status info */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Current status</span>
                <StatusBadge status={page.status} />
              </div>
              {page.published_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Published</span>
                  <span className="text-sm text-text-primary">
                    {new Date(page.published_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Navigation</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Show in Navigation</p>
                  <p className="text-xs text-text-tertiary">Display in site menu</p>
                </div>
                <Switch
                  checked={showInNav}
                  onCheckedChange={setShowInNav}
                />
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
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Page</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{page.title}&quot;? This action cannot be undone.
              {page.status === 'published' && (
                <span className="mt-2 block font-medium text-error-text">
                  This page is currently published and visible to the public.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Page'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview: {page.title}</DialogTitle>
            <DialogDescription>
              Rendered preview of the page body HTML
            </DialogDescription>
          </DialogHeader>
          <div
            className="prose prose-sm max-h-[60vh] max-w-none overflow-y-auto rounded-lg border border-border bg-surface p-4 text-text-primary"
            dangerouslySetInnerHTML={{ __html: bodyHtml || '<p class="text-text-tertiary">No content yet.</p>' }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
