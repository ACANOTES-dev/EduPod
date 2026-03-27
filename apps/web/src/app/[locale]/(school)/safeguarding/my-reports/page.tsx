import { redirect } from 'next/navigation';

export default function SafeguardingReportsRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/pastoral/concerns`);
}
