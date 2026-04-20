import { redirect } from 'next/navigation';

export default function ResourcesRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/wellbeing/staff#resources`);
}
