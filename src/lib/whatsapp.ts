import type { Product } from '../types/product';

const WHATSAPP_NUMBER = '260964687209';

export function getProductWhatsAppUrl(product: Product): string {
  const message = `Hello Yolique Boutique, I would like to order: ${product.title} (K${product.price_zmw})`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}