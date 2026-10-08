import { ArrowUpRight, MessageCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '../types/product';
import { getProductWhatsAppUrl, logOrderIntent } from '../lib/whatsapp';

interface ProductCardProps {
  product: Product;
  onAddToBag: (product: Product) => void;
}

export function ProductCard({ product, onAddToBag }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(product.image_url) && !imageFailed;
  const handleOrderClick = () => {
    void logOrderIntent({
      productId: product.id,
      productTitle: product.title,
      selectedSize: null,
      priceZmw: product.price_zmw,
    }).catch((error: unknown) => {
      console.error('Unable to record WhatsApp order intent.', error);
    });
  };

  return (
    <article className="product-card">
      <div className="product-image-wrap">
        {hasImage ? (
          <img
            alt={product.title}
            className="product-image"
            loading="lazy"
            onError={() => setImageFailed(true)}
            src={product.image_url}
          />
        ) : (
          <div aria-label="Product image unavailable" className="image-fallback" role="img">
            <span className="fallback-monogram">YB</span>
            <span className="fallback-caption">Yolique Boutique</span>
          </div>
        )}
        {product.category && <span className="product-category">{product.category}</span>}
        <button
          aria-label={`Add ${product.title} to bag`}
          className="quick-add"
          onClick={() => onAddToBag(product)}
          title="Add to bag"
          type="button"
        >
          <Plus aria-hidden="true" size={18} strokeWidth={1.6} />
        </button>
      </div>

      <div className="product-info">
        <div className="product-heading">
          <h3>{product.title}</h3>
          <p className="product-price">K{product.price_zmw}</p>
        </div>
        {product.description && <p className="product-description">{product.description}</p>}
        <a className="product-order" href={getProductWhatsAppUrl(product)} onClick={handleOrderClick} rel="noreferrer" target="_blank">
          <MessageCircle aria-hidden="true" size={15} strokeWidth={1.7} />
          <span>Order on WhatsApp</span>
          <ArrowUpRight aria-hidden="true" className="order-arrow" size={15} strokeWidth={1.6} />
        </a>
      </div>
    </article>
  );
}