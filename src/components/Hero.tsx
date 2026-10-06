export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="hero-section">
      <div aria-hidden="true" className="hero-overlay" />
      <div className="hero-copy">
        <span className="hero-subtitle">LUSAKA · HAND-PICKED PIECES</span>
        <h1 id="hero-title">Yolique Boutique</h1>
        <p className="hero-tagline">Curated. Stylish. Sustainable.</p>
        <span className="hero-footer">THRIFT FASHION, REDEFINED.</span>
        <a className="hero-cta" href="#collection">SHOP COLLECTION</a>
      </div>
    </section>
  );
}