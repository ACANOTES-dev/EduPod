// ─── Auth module shared types ───────────────────────────────────────────────

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: SanitisedUser;
}

export interface MfaRequiredResult {
  mfa_required: true;
  mfa_token: string;
}

export interface SanitisedUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  preferred_locale: string | null;
  global_status: string;
  mfa_enabled: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

export interface MfaSetupResult {
  secret: string;
  qr_code_url: string;
  otpauth_uri: string;
}

export interface SessionInfo {
  session_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active_at: string;
  tenant_id: string | null;
}
