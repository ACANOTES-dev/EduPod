import { redirect } from 'next/navigation';

export default function EngagementIndexPage({
  params,
}: {
  params: {
    locale: string;
  };
}) {
  redirect(`/${params.locale}/engagement/events`);
}
