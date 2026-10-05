export interface Product {
  id: string;
  created_at: string;
  title: string;
  description?: string;
  price_zmw: number;
  category?: string;
  image_url?: string;
}