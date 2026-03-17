export interface Room {
  id: string;
  tenant_id: string;
  name: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}
