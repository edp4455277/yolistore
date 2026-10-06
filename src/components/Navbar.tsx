import { MessageCircle, Moon, ShoppingBag, Sun } from 'lucide-react';

interface NavbarProps {
  cartCount: number;
  isDarkMode: boolean;
  onOpenCart: () => void;
  onToggleTheme: () => void;
}

export function Navbar({ cartCount, isDarkMode, onOpenCart, onToggleTheme }: NavbarProps) {
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
        <button
          aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
          className="theme-toggle"
          onClick={onToggleTheme}
          title={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
          type="button"
        >
          {isDarkMode ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
        </button>
        <button aria-label={`Open shopping bag, ${cartCount} items`} className="bag-button" onClick={onOpenCart} type="button">
          <ShoppingBag aria-hidden="true" size={17} strokeWidth={1.6} />
          <span>Bag</span>
          <span className="bag-count">{cartCount}</span>
        </button>
      </div>
    </header>
  );
}