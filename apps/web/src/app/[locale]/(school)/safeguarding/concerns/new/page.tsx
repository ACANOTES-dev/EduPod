import { redirect } from 'next/navigation';

export default function SafeguardingConcernCreateRedirect({
  params,
}: {
  params: { locale: string };
}) {
  redirect(`/${params.locale}/pastoral/concerns/new`);
}
