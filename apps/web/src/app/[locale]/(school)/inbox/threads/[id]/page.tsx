'use client';

import { useParams } from 'next/navigation';

import { ThreadView } from '../../_components/thread-view';

export default function InboxThreadPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) return null;

  return <ThreadView conversationId={id} />;
}
