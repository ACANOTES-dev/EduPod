import { redirect } from 'next/navigation';

export default function SurveysListRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/wellbeing/staff#surveys`);
}
