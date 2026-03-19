import { redirect } from 'next/navigation';

// Redirect /settings to /settings/branding (default tab)
export default function SettingsPage({
  params,
}: {
  params: { locale: string };
}) {
  redirect(`/${params?.locale}/settings/branding`);
}
