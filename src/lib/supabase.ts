import { createClient } from '@supabase/supabase-js';
import type { Product } from '../types/product';

type ProductRow = Pick<Product, keyof Product>;

interface Database {
  public: {
    Tables: {
      products: {
        Row: ProductRow;
        Insert: Partial<ProductRow>;
        Update: Partial<ProductRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null;