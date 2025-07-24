export interface Member {
  id: number;
  family_id: number;
  name: string;
  gender: 'male' | 'female' | 'other';
  birth_date?: string;
  death_date?: string | null;
  father_id?: number | null;
  mother_id?: number | null;
  spouse_id?: number | null;
  parent_id?: number | null;
  created_at: string;
  updated_at: string;
}