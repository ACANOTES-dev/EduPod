import { redirect } from 'next/navigation';

export default function SafeguardingConcernDetailRedirect({
  params,
}: {
  params: { locale: string; id: string };
}) {
  redirect(`/${params.locale}/pastoral/concerns/${params.id}`);
}
