import { redirect } from 'next/navigation';

// WB-C-22 — Drop the `#aggregate` anchor. The aggregate section only renders
// for admin roles (school_owner / school_principal / school_vice_principal /
// admin); teachers scrolling to an anchor that doesn't exist landed in an
// empty viewport. The staff page's in-page nav is role-aware and will show
// the correct default section for each user.
export default function StaffDashboardRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/wellbeing/staff`);
}
