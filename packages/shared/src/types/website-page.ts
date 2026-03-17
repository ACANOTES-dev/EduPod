export type WebsitePageType = 'home' | 'about' | 'admissions' | 'contact' | 'custom';
export type WebsitePageStatus = 'draft' | 'published' | 'unpublished';

export interface WebsitePage {
  id: string;
  tenant_id: string;
  locale: string;
  page_type: WebsitePageType;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  body_html: string;
  status: WebsitePageStatus;
  show_in_nav: boolean;
  nav_order: number;
  author_user_id: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
