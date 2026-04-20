import { redirect } from 'next/navigation';

export default function MyWorkloadRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/wellbeing/staff#my`);
}
