import { ArrowDown, ArrowUpRight, MessageCircle, Minus, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { ProductGrid } from './components/ProductGrid';
import { supabase } from './lib/supabase';
import { getProductWhatsAppUrl } from './lib/whatsapp';
import type { Product } from './types/product';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchProducts() {
      setLoading(true);
      setError(null);

      if (!supabase) {
        if (active) {
          setError('Supabase is not configured. Add the project URL and anon key to your environment.');
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error: queryError } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        if (active) setProducts(data);
      } catch {
        if (active) setError('Unable to connect to the boutique right now. Please try again shortly.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchProducts();
    return () => {
      active = false;
    };
  }, [requestKey]);

  function removeFromCart(indexToRemove: number) {
    setCart((items) => items.filter((_, index) => index !== indexToRemove));
  }

  return (
    <div id="top" className="app-shell">
      <Navbar cartCount={cart.length} onOpenCart={() => setCartOpen(true)} />

      <main>
        <section aria-labelledby="hero-title" className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-rule" /> THE YOlique EDIT · EST. LUSAKA</span>
            <h1 id="hero-title">Curated Luxury <span>&amp; Fashion</span></h1>
            <p>Considered pieces for the way you want to feel. Discover a more personal expression of everyday luxury.</p>
            <a className="hero-link" href="#collection">
              <span>Explore the collection</span>
              <ArrowDown aria-hidden="true" size={15} strokeWidth={1.6} />
            </a>
          </div>
          <div aria-label="Editorial fashion portrait" className="hero-image" role="img">
            <span className="hero-image-label">A study in presence</span>
            <span className="hero-image-number">01 — 04</span>
          </div>
          <div className="hero-side-note">DRESS WITH INTENTION <span>·</span> LIVE BEAUTIFULLY</div>
        </section>

        <section aria-labelledby="collection-title" className="collection-section" id="collection">
          <div className="section-heading">
            <div>
              <span className="eyebrow"><span className="eyebrow-rule" /> SELECTED FOR YOU</span>
              <h2 id="collection-title">The Collection<span className="gold-period">.</span></h2>
            </div>
            <span className="section-aside">A considered wardrobe, made personal.</span>
          </div>

          {error && (
            <div className="connection-alert" role="alert">
              <span>{error}</span>
              <button onClick={() => setRequestKey((key) => key + 1)} type="button">Try again <ArrowUpRight aria-hidden="true" size={14} /></button>
            </div>
          )}

          <ProductGrid
            error={error}
            loading={loading}
            onAddToBag={(product) => setCart((items) => [...items, product])}
            products={products}
          />
        </section>

        <section aria-labelledby="story-title" className="story-section" id="story">
          <span className="eyebrow"><span className="eyebrow-rule" /> OUR POINT OF VIEW</span>
          <h2 id="story-title">Style is personal.<br /><span>Luxury should be, too.</span></h2>
          <p>Yolique brings together pieces chosen for their feeling, their finish, and the confidence they leave with you.</p>
          <a href="https://wa.me/260964687209" rel="noreferrer" target="_blank">
            <span>Speak with our boutique</span>
            <ArrowUpRight aria-hidden="true" size={15} />
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <a aria-label="Yolique Boutique home" className="footer-brand" href="#top">YOLIQUE <span>BOUTIQUE</span></a>
        <span className="footer-note">LUSAKA, ZAMBIA <span>·</span> MADE FOR YOUR MOMENTS</span>
        <a aria-label="Contact Yolique Boutique on WhatsApp" className="footer-contact" href="https://wa.me/260964687209" rel="noreferrer" target="_blank">
          <MessageCircle aria-hidden="true" size={15} /> WhatsApp
        </a>
      </footer>

      {cartOpen && (
        <div className="cart-layer">
          <button aria-label="Close shopping bag" className="cart-backdrop" onClick={() => setCartOpen(false)} type="button" />
          <aside aria-label="Shopping bag" aria-modal="true" className="cart-panel" role="dialog">
            <div className="cart-header">
              <div>
                <span className="eyebrow"><span className="eyebrow-rule" /> YOUR SELECTION</span>
                <h2>Your bag <span>({cart.length})</span></h2>
              </div>
              <button aria-label="Close shopping bag" className="icon-button" onClick={() => setCartOpen(false)} type="button"><X aria-hidden="true" size={19} /></button>
            </div>

            {cart.length === 0 ? (
              <div className="cart-empty">
                <ShoppingBagIcon />
                <h3>Your bag is waiting.</h3>
                <p>Pieces you love will find their place here.</p>
                <button onClick={() => setCartOpen(false)} type="button">Continue exploring <ArrowUpRight aria-hidden="true" size={14} /></button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((product, index) => (
                    <article className="cart-item" key={`${product.id}-${index}`}>
                      <div className="cart-item-image">
                        {product.image_url ? <img alt="" loading="lazy" src={product.image_url} /> : <span>YB</span>}
                      </div>
                      <div className="cart-item-detail">
                        <h3>{product.title}</h3>
                        <span>K{product.price_zmw}</span>
                        <a href={getProductWhatsAppUrl(product)} rel="noreferrer" target="_blank">
                          <MessageCircle aria-hidden="true" size={13} /> Inquire on WhatsApp
                        </a>
                      </div>
                      <button aria-label={`Remove ${product.title} from bag`} className="remove-item" onClick={() => removeFromCart(index)} type="button">
                        <Minus aria-hidden="true" size={15} />
                      </button>
                    </article>
                  ))}
                </div>
                <p className="cart-note">Orders are confirmed personally with our boutique team.</p>
                <a className="cart-contact" href="https://wa.me/260964687209" rel="noreferrer" target="_blank">
                  <MessageCircle aria-hidden="true" size={16} /> Contact the boutique <ArrowUpRight aria-hidden="true" size={15} />
                </a>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function ShoppingBagIcon() {
  return <Plus aria-hidden="true" className="cart-empty-icon" size={24} strokeWidth={1.4} />;
}