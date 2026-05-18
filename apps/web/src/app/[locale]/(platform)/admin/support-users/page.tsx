import { redirect } from 'next/navigation';

export default function SupportUsersRedirectPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/admin/users`);
}
