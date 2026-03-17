import { redirect } from 'next/navigation';

export default function PublicPage({ params: { locale } }: { params: { locale: string } }) {
  redirect(`/${locale}/dashboard`);
}
