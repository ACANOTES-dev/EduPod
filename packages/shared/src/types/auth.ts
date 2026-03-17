export interface JwtPayload {
  sub: string; // user ID
  email: string;
  tenant_id: string | null; // null for platform-level
  membership_id: string | null;
  type: 'access';
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string; // user ID
  session_id: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

export interface SessionMetadata {
  user_id: string;
  session_id: string;
  tenant_id: string | null;
  membership_id: string | null;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active_at: string;
}
