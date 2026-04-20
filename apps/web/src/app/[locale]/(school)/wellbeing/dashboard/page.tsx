import { redirect } from 'next/navigation';

export default function StaffDashboardRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/wellbeing/staff#aggregate`);
}
