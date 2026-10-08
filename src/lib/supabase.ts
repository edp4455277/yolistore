import { createClient } from '@supabase/supabase-js';

export type ProductRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  category: string | null;
  price_zmw: number;
  original_price_zmw: number | null;
  sizes: string[];
  colors: string[];
  sold: boolean;
  image_url: string | null;
  images: string | null;
};

interface Database {
  public: {
    Tables: {
      products: {
        Row: ProductRow;
        Insert: Omit<ProductRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ProductRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      orders_log: {
        Row: {
          id: number;
          product_id: string;
          product_title: string;
          selected_size: string | null;
          price_zmw: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          product_id: string;
          product_title: string;
          selected_size: string | null;
          price_zmw: number;
          created_at?: string;
        };
        Update: Partial<{
          product_id: string;
          product_title: string;
          selected_size: string | null;
          price_zmw: number;
          created_at: string;
        }>;
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