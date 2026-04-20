import { redirect } from 'next/navigation';

export default function BoardReportRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/wellbeing/staff#board-report`);
}
