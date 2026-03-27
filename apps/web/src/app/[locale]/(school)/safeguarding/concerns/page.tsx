import { redirect } from 'next/navigation';

export default function SafeguardingConcernListRedirect({
  params,
}: {
  params: { locale: string };
}) {
  redirect(`/${params.locale}/pastoral/concerns`);
}
