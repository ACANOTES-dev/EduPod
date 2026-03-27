import { redirect } from 'next/navigation';

export default function SafeguardingPageRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/pastoral`);
}
