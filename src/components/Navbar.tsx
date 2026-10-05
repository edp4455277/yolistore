import { MessageCircle, ShoppingBag } from 'lucide-react';

interface NavbarProps {
  cartCount: number;
  onOpenCart: () => void;
}

export function Navbar({ cartCount, onOpenCart }: NavbarProps) {
  return (
    <header className="site-header">
      <a aria-label="Yolique Boutique home" className="brand" href="#top">
        <span className="brand-mark">Y</span>
        <span className="brand-name">Yolique <span>Boutique</span></span>
      </a>

      <nav aria-label="Main navigation" className="header-nav">
        <a className="nav-link" href="#collection">Collection</a>
        <a className="nav-link nav-story" href="#story">Our point of view</a>
      </nav>

      <div className="header-actions">
        <a className="contact-link" href="https://wa.me/260964687209" rel="noreferrer" target="_blank">
          <MessageCircle aria-hidden="true" size={15} strokeWidth={1.7} />
          <span>Contact us</span>
        </a>
        <button aria-label={`Open shopping bag, ${cartCount} items`} className="bag-button" onClick={onOpenCart} type="button">
          <ShoppingBag aria-hidden="true" size={17} strokeWidth={1.6} />
          <span>Bag</span>
          <span className="bag-count">{cartCount}</span>
        </button>
      </div>
    </header>
  );
}