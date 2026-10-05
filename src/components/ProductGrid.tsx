import { ProductCard } from './ProductCard';
import type { Product } from '../types/product';

interface ProductGridProps {
  products: Product[];
  loading: boolean;
  error: string | null;
  onAddToBag: (product: Product) => void;
}

export function ProductGrid({ products, loading, error, onAddToBag }: ProductGridProps) {
  if (loading) {
    return (
      <div aria-label="Loading collection" className="product-grid" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <div className="skeleton-image" />
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-price" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state" role="status">
        <span className="empty-index">01 / CONNECTION</span>
        <h3>The collection is taking a moment.</h3>
        <p>Our boutique is temporarily unavailable. Please try again shortly.</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="empty-state" role="status">
        <span className="empty-index">01 / COLLECTION</span>
        <h3>No items currently available in store.</h3>
        <p>Our next edit is on its way. Please check back soon.</p>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} onAddToBag={onAddToBag} product={product} />
      ))}
    </div>
  );
}