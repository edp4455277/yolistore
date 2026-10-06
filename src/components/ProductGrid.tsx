import { Search } from 'lucide-react';
import { ProductCard } from './ProductCard';
import type { Product } from '../types/product';

interface ProductGridProps {
  products: Product[];
  loading: boolean;
  error: string | null;
  selectedCategory: string;
  searchQuery: string;
  onCategoryChange: (category: string) => void;
  onSearchChange: (query: string) => void;
  onAddToBag: (product: Product) => void;
}

export function ProductGrid({
  products,
  loading,
  error,
  selectedCategory,
  searchQuery,
  onCategoryChange,
  onSearchChange,
  onAddToBag,
}: ProductGridProps) {
  const categories = ['All', ...new Set(products
    .map((product) => product.category)
    .filter((category): category is string => Boolean(category?.trim())))];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProducts = selectedCategory.toLowerCase() === 'all'
    ? products.filter((product) => (
      !normalizedQuery
      || product.title.toLowerCase().includes(normalizedQuery)
      || product.description?.toLowerCase().includes(normalizedQuery)
    ))
    : products.filter((product) => (
      product.category?.toLowerCase() === selectedCategory.toLowerCase()
      && (
        !normalizedQuery
        || product.title.toLowerCase().includes(normalizedQuery)
        || product.description?.toLowerCase().includes(normalizedQuery)
      )
    ));

  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-rule" /> SELECTED FOR YOU</span>
          <h2 id="collection-title">The Collection<span className="gold-period">.</span></h2>
        </div>
      </div>

      <label className="product-search">
        <Search aria-hidden="true" size={17} strokeWidth={1.7} />
        <input
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="Search products..."
          type="search"
          value={searchQuery}
        />
      </label>

      <section aria-labelledby="category-filter-title" className="category-section">
        <h3 id="category-filter-title">Shop by Category</h3>
        <div aria-label="Filter products by category" className="category-filters" role="group">
          {categories.map((category) => {
            const count = category === 'All'
              ? products.length
              : products.filter((product) => product.category?.toLowerCase() === category.toLowerCase()).length;
            const isActive = selectedCategory.toLowerCase() === category.toLowerCase();

            return (
              <button
                aria-pressed={isActive}
                className={`category-filter${isActive ? ' is-active' : ''}`}
                key={category}
                onClick={() => onCategoryChange(category)}
                type="button"
              >
                <span>{category}</span>
                <span aria-label={`${count} products`} className="category-count">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {loading ? (
        <div aria-busy="true" aria-label="Loading collection" className="product-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton-card" key={index}>
              <div className="skeleton-image" />
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-price" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="empty-state" role="status">
          <span className="empty-index">01 / CONNECTION</span>
          <h3>The collection is taking a moment.</h3>
          <p>Our boutique is temporarily unavailable. Please try again shortly.</p>
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state" role="status">
          <span className="empty-index">01 / COLLECTION</span>
          <h3>No items currently available in store.</h3>
          <p>Our next edit is on its way. Please check back soon.</p>
        </div>
      ) : (
        <>
          {filteredProducts.length > 0 ? (
            <div className="product-grid">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} onAddToBag={onAddToBag} product={product} />
              ))}
            </div>
          ) : (
            <div className="empty-state" role="status">
              <span className="empty-index">01 / COLLECTION</span>
              <h3>No matching pieces found.</h3>
              <p>Try another search or category to explore the collection.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}