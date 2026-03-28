import { redirect } from 'next/navigation';

export default function LegalSettingsPage({
  params,
}: {
  params: { locale: string };
}) {
  redirect(`/${params.locale}/settings/legal/dpa`);
}
