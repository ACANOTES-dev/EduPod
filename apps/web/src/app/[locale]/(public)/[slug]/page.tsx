import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicPage {
  id: string;
  title: string;
  slug: string;
  meta_title: string | null;
  meta_description: string | null;
  body_html: string | null;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchPage(slug: string): Promise<PublicPage | null> {
  const API_URL = process.env.API_URL || 'http://localhost:5552';
  try {
    const res = await fetch(`${API_URL}/api/v1/public/pages/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json() as { data: PublicPage };
    return data.data;
  } catch (err) {
    console.error('[Page]', err);
    return null;
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: { slug: string; locale: string } }) {
  const page = await fetchPage(params?.slug);
  if (!page) return {};
  return {
    title: page.meta_title ?? page.title,
    description: page.meta_description ?? undefined,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicSlugPage({
  params,
}: {
  params: { slug: string; locale: string };
}) {
  const page = await fetchPage(params?.slug);
  const t = await getTranslations('website');

  if (!page) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      {/* Page header */}
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">{page.title}</h1>
      </header>

      {/* Page body */}
      {page.body_html ? (
        <article
          className="prose prose-sm max-w-none text-text-primary"
          dangerouslySetInnerHTML={{ __html: page.body_html }}
        />
      ) : (
        <p className="text-text-tertiary">{t('noContentAvailable')}</p>
      )}
    </div>
  );
}
