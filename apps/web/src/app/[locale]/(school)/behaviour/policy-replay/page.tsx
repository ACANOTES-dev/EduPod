import { redirect } from 'next/navigation';

// WB-118 — The hub tile links to `/behaviour/policy-replay` but the page
// itself lives under `/behaviour/policies/replay` (alongside the other
// policy surfaces). Redirect so the tile, any old bookmarks, and anyone
// following the spec all land in the same place.
export default function PolicyReplayRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/behaviour/policies/replay`);
}
