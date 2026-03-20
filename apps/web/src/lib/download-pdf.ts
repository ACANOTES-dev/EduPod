import { getAccessToken } from './api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Fetch a PDF endpoint with auth headers, create a blob URL, and open it.
 */
export async function downloadAuthenticatedPdf(path: string): Promise<void> {
  const token = getAccessToken();
  const url = `${API_URL}${path}`;

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`PDF download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');

  // Clean up blob URL after a delay
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
