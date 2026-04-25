'use client';

import * as React from 'react';

import ReportBuilderPage from '../page';

/**
 * `/reports/builder/:id` — opens an existing saved report in the
 * builder. The actual builder page hydrates from `useParams()` so this
 * route simply re-exports the shared editor; impl 16 keeps both routes
 * in sync via the same component.
 */
export default function SavedReportBuilderPage() {
  return <ReportBuilderPage />;
}
