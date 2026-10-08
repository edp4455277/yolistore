import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { CATEGORIES, COLOR_SWATCHES } from "../lib/options";
import { placeOrder, isNewArrival } from "../lib/orders";
import "./storefront.css";

// ---- Edit these ----
const WHATSAPP = "260000000000"; // your number, country code first, no + or spaces
const CURRENCY = "K";

// Shown in the "Good to know" section. Leave a text as "" to hide that line.
const INFO: { title: string; text: string }[] = [
  {
    title: "How ordering works",
    text: "Send your bag on WhatsApp. We confirm the pieces are yours, then arrange payment and delivery with you.",
  },
  { title: "Delivery", text: "" }, // e.g. areas you deliver to, fees, how long it takes
  { title: "Exchanges", text: "" }, // e.g. your exchange / return policy
];
// --------------------

type Product = {
  id: string | number;
  name: string;
  description: string;
  price: number;
  original_price: number | null;
  category: string;
  images: string[];
  sizes: string[];
  colors: string[];
  sold: boolean;
  condition: string;
  measurements: string;
  created_at: string | null;
};
type BagItem = { key: string; id: Product["id"]; size: string; color: string };

const norm = (s?: string) => (s || "").toLowerCase().trim().replace(/s$/, "");
const num = (v: unknown) => parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
const money = (n: number | string) =>
  Number.isFinite(Number(n)) ? `${CURRENCY}${Number(n).toLocaleString()}` : "Ask for price";
// accepts a Postgres array or a comma-separated string
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === "string" && v.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

const PATHS: Record<string, string> = {
  heart: "M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6c-2.3 4.4-9.3 9-9.3 9z",
  bag: "M5 8h14l-1 12H6L5 8zm4 0V6a3 3 0 0 1 6 0v2",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.5-4.5",
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4v-9z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  close: "M6 6l12 12M18 6L6 18",
};
const Icon = ({ n, fill }: { n: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill={fill ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[n]} />
  </svg>
);

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState("loading");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [onlySaved, setOnlySaved] = useState(false);
  const [bag, setBag] = useState<BagItem[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [sel, setSel] = useState<Product | null>(null);
  const [size, setSize] = useState("");
  const [cardSizes, setCardSizes] = useState<Record<string, string>>({});
  const [color, setColor] = useState("");
  const [need, setNeed] = useState(false);
  const [toast, setToast] = useState(false);
  const [notice, setNotice] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [lastOrder, setLastOrder] = useState<{ ref: string; url: string } | null>(null);
  const [saved, setSaved] = useState<Product["id"][]>(() => {
    try { return JSON.parse(localStorage.getItem("yb-saved") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (!supabase) { setStatus("error"); return; }
    supabase.from("products").select("*").then(({ data, error }) => {
      if (error) return setStatus("error");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: Product[] = (data ?? []).map((r: any) => {
        const one = r.image_url ?? r.image ?? null;
        const imgs = list(r.images);
        return {
          id: r.id,
          name: r.name ?? r.title ?? "",
          description: r.description ?? "",
          price: num(r.price_zmw ?? r.price ?? r[Object.keys(r).find((k) => /price|amount|cost/i.test(k) && !/original|compare|old|was|discount/i.test(k)) ?? "price"]),
          original_price: num(r.original_price_zmw ?? r.original_price ?? r.compare_at_price) || null,
          category: r.category ?? "",
          images: imgs.length ? imgs : one ? [one] : [],
          sizes: list(r.sizes ?? r.size),
          colors: list(r.colors ?? r.colours ?? r.color),
          sold: !!r.sold,
          condition: r.condition ?? "",
          measurements: r.measurements ?? "",
          created_at: r.created_at ?? null,
        };
      });
      setProducts(rows);
      setStatus("ready");
    });
  }, []);

  useEffect(() => {
    try { localStorage.setItem("yb-saved", JSON.stringify(saved)); } catch { /* ignore */ }
  }, [saved]);

  // open a product straight from a shared link  (…/#/p/<id>)
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked || status !== "ready") return;
    setDeepLinked(true);
    const m = window.location.hash.match(/^#\/p\/(.+)$/);
    const found = m && products.find((p) => String(p.id) === decodeURIComponent(m[1]));
    if (found) openProduct(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, products, deepLinked]);

  // lock page scroll + Esc to close while the sheet is open
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [sel]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    products.forEach((p) => { const k = norm(p.category); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [products]);

  const shown = products.filter((p) =>
    (cat === "All" || norm(p.category) === norm(cat)) &&
    (!onlySaved || saved.includes(p.id)) &&
    p.name.toLowerCase().includes(q.toLowerCase())
  );

  const toggleSaved = (id: Product["id"]) =>
    setSaved(saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id]);

  const openProduct = (p: Product) => {
    setSel(p);
    setSize(p.sizes.length === 1 ? p.sizes[0] : cardSizes[p.id] ?? "");
    setColor(p.colors.length === 1 ? p.colors[0] : "");
    setNeed(false);
  };

  const addToBag = () => {
    if (!sel) return;
    if ((sel.sizes.length && !size) || (sel.colors.length && !color)) return setNeed(true);
    const key = `${sel.id}|${size}|${color}`;
    setBag((b) => (b.some((i) => i.key === key) ? b : [...b, { key, id: sel.id, size, color }]));
    setSel(null);
    setToast(true);
    setTimeout(() => setToast(false), 1800);
  };

  const bagLines = bag
    .map((i) => ({ ...i, p: products.find((p) => p.id === i.id) }))
    .filter((x): x is BagItem & { p: Product } => !!x.p);
  const total = bagLines.reduce((s, x) => s + x.p.price, 0);
  const detail = (x: BagItem) => [x.size && `Size ${x.size}`, x.color].filter(Boolean).join(", ");
  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 2200);
  };

  const buildWaLink = (ref: string, lines: typeof bagLines, sum: number) =>
    `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
      `Hi Yolique Boutique, I'd like to order:\nReference: #${ref}\n` +
        lines.map((x) =>
          `- ${x.p.name}${detail(x) ? ` (${detail(x)})` : ""} - ZMW ${x.p.price.toLocaleString()}`
        ).join("\n") +
        `\nTotal: ZMW ${sum.toLocaleString()}`
    )}`;

  // Save the order (and mark one-of-one pieces sold), then open WhatsApp.
  const checkout = async () => {
    if (placing || !bagLines.length) return;
    setPlacing(true);
    setOrderError("");
    // open the tab now (inside the tap) so phone browsers don't block it after the wait
    const tab = window.open("", "_blank");
    const lines = bagLines;
    const sum = total;
    const result = await placeOrder(
      lines.map((x) => ({ id: String(x.p.id), size: x.size, color: x.color })),
    );
    setPlacing(false);

    if (!result.ok) {
      tab?.close();
      if (result.soldIds.length) {
        const gone = new Set(result.soldIds);
        const names = lines.filter((x) => gone.has(String(x.p.id))).map((x) => x.p.name);
        setBag((b) => b.filter((i) => !gone.has(String(i.id))));
        setProducts((ps) => ps.map((p) => (gone.has(String(p.id)) ? { ...p, sold: true } : p)));
        setOrderError(`Sorry, ${names.join(", ") || "a piece"} was just taken, so we removed it from your bag. Check the rest and try again.`);
      } else {
        setOrderError(result.error);
      }
      return;
    }

    const url = buildWaLink(result.ref, lines, sum);
    if (tab) tab.location.href = url;
    else window.location.assign(url);

    const oneOfOne = new Set(lines.filter((x) => x.p.sizes.length <= 1).map((x) => String(x.p.id)));
    setProducts((ps) => ps.map((p) => (oneOfOne.has(String(p.id)) ? { ...p, sold: true } : p)));
    setLastOrder({ ref: result.ref, url });
    setBag([]);
  };

  const shareProduct = async (p: Product) => {
    const url = `${window.location.origin}/p/${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: `${p.name} - ${money(p.price)}`, url });
      else {
        await navigator.clipboard.writeText(url);
        flash("Link copied");
      }
    } catch { /* share cancelled */ }
  };

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="yb">
      <header className="yb-top">
        <div className="yb-logo">Yolique <span>Boutique</span></div>
        <button className="yb-iconbtn" onClick={() => setBagOpen(true)} aria-label="Open bag">
          <Icon n="bag" />
          {bag.length > 0 && <b className="yb-dot">{bag.length}</b>}
        </button>
      </header>

      <section className="yb-hero">
        <h1>Thrift fashion, redefined.</h1>
        <p>Hand-picked, one-of-one pieces. Order in seconds on WhatsApp.</p>
        <button className="yb-gold" onClick={() => go("shop")}>Shop the collection</button>
      </section>

      <main id="shop" className="yb-main">
        <label className="yb-search">
          <Icon n="search" />
          <input id="yb-q" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search dresses, jeans, bags..." />
        </label>

        <h2>Shop by category</h2>
        <div className="yb-pills">
          {["All", ...CATEGORIES].filter((c) => c === "All" || counts[norm(c)] || cat === c).map((c) => (
            <button key={c} className={`yb-pill ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
              {c}<i>{c === "All" ? products.length : counts[norm(c)] || 0}</i>
            </button>
          ))}
        </div>

        <div className="yb-row">
          <h2>{onlySaved ? "Saved pieces" : "Featured pieces"}</h2>
          {(cat !== "All" || onlySaved || q) && (
            <button className="yb-link" onClick={() => { setCat("All"); setOnlySaved(false); setQ(""); }}>
              Clear filters
            </button>
          )}
        </div>

        {status === "loading" && <p className="yb-note">Loading pieces...</p>}
        {status === "error" && <p className="yb-note">Couldn't load products. Check your connection and refresh.</p>}
        {status === "ready" && shown.length === 0 && <p className="yb-note">Nothing matches. Try another category or search.</p>}

        <div className="yb-grid">
          {shown.map((p) => {
            const off = p.original_price && p.original_price > p.price
              ? Math.round((1 - p.price / p.original_price) * 100) : 0;
            return (
              <article key={p.id} className={`yb-card ${p.sold ? "is-sold" : ""}`} role="button" tabIndex={0}
                onClick={() => openProduct(p)}
                onKeyDown={(e) => e.key === "Enter" && openProduct(p)}>
                <div className="yb-img">
                  {p.images[0] ? <img src={p.images[0]} alt={p.name} loading="lazy" /> : <span>{(p.name || "?")[0]}</span>}
                  {p.sold ? <em className="yb-sold">Sold</em> : off > 0 && <em className="yb-off">-{off}%</em>}
                  {!p.sold && isNewArrival(p.created_at) && <em className="yb-new">Just dropped</em>}
                  <button className={`yb-heart ${saved.includes(p.id) ? "on" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleSaved(p.id); }} aria-label="Save">
                    <Icon n="heart" fill={saved.includes(p.id)} />
                  </button>
                </div>
                <div className="yb-info">
                  <small>{p.category}</small>
                  <h3>{p.name}</h3>
                  {p.sizes.length === 1 ? (
                    <span className="yb-size-badge">Size: {p.sizes[0]} (Single Piece)</span>
                  ) : p.sizes.length > 1 ? (
                    <div className="yb-card-sizes" aria-label={`Choose a size for ${p.name}`}>
                      {p.sizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`yb-chip yb-size ${cardSizes[p.id] === s ? "on" : ""}`}
                          aria-pressed={cardSizes[p.id] === s}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardSizes((selected) => ({ ...selected, [p.id]: s }));
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="yb-price">
                    <strong>{money(p.price)}</strong>
                    {off > 0 && <s>{money(p.original_price as number)}</s>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {sel && (
        <>
          <div className="yb-scrim" onClick={() => setSel(null)} />
          <section className="yb-sheet" role="dialog" aria-label={sel.name}>
            <button className="yb-x" onClick={() => setSel(null)} aria-label="Close"><Icon n="close" /></button>
            <div className="yb-gal">
              {sel.images.length
                ? sel.images.map((src, i) => <img key={i} src={src} alt={`${sel.name} ${i + 1}`} />)
                : <div className="yb-ph">{(sel.name || "?")[0]}</div>}
            </div>
            <div className="yb-detail">
              <div>
                <small className="yb-desc">{sel.category}</small>
                <h2>{sel.name}</h2>
              </div>
              <div className="yb-price">
                <strong>{money(sel.price)}</strong>
                {sel.original_price && sel.original_price > sel.price && <s>{money(sel.original_price)}</s>}
              </div>
              {sel.description && <p className="yb-desc">{sel.description}</p>}
              {(sel.condition || sel.measurements) && (
                <ul className="yb-meta">
                  {sel.condition && <li><span>Condition</span>{sel.condition}</li>}
                  {sel.measurements && <li><span>Measurements</span>{sel.measurements}</li>}
                </ul>
              )}
              {!sel.sold && sel.sizes.length <= 1 && (
                <p className="yb-one">One of one. Once it's gone, it's gone.</p>
              )}

              {sel.colors.length > 0 && (
                <div className={`yb-opt ${need && !color ? "need" : ""}`}>
                  <p>{color ? `Colour: ${color}` : "Select a colour"}</p>
                  <div className="yb-chips">
                    {sel.colors.map((c) => COLOR_SWATCHES[c.toLowerCase()] ? (
                      <button key={c} className={`yb-sw ${color === c ? "on" : ""}`} style={{ background: COLOR_SWATCHES[c.toLowerCase()] }}
                        onClick={() => setColor(c)} aria-label={c} title={c} />
                    ) : (
                      <button key={c} className={`yb-chip ${color === c ? "on" : ""}`} onClick={() => setColor(c)}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              {sel.sizes.length === 1 ? (
                <div className="yb-opt">
                  <span className="yb-size-badge">Size: {sel.sizes[0]} (Single Piece)</span>
                </div>
              ) : sel.sizes.length > 1 && (
                <div className={`yb-opt ${need && !size ? "need" : ""}`}>
                  <p>{size ? `Size: ${size}` : "Select a size"}</p>
                  <div className="yb-chips">
                    {sel.sizes.map((s) => (
                      <button key={s} className={`yb-chip yb-size ${size === s ? "on" : ""}`}
                        aria-pressed={size === s}
                        onClick={() => {
                          setSize(s);
                          setCardSizes((selected) => ({ ...selected, [sel.id]: s }));
                        }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              <button className="yb-link" onClick={() => toggleSaved(sel.id)}>
                {saved.includes(sel.id) ? "Remove from saved" : "Save for later"}
              </button>
              <button className="yb-link" onClick={() => void shareProduct(sel)}>Share this piece</button>
            </div>
            <div className="yb-foot">
              <button className="yb-gold" onClick={addToBag} disabled={sel.sold}>{sel.sold ? "Sold out" : `Add to bag · ${money(sel.price)}`}</button>
            </div>
          </section>
        </>
      )}

      {bag.length > 0 && !sel && !bagOpen && (
        <button className="yb-bar" onClick={() => setBagOpen(true)}>
          <span>View bag ({bag.length})</span><strong>{money(total)}</strong>
        </button>
      )}

      {toast && <div className="yb-toast">Added to bag</div>}
      {notice && <div className="yb-toast">{notice}</div>}

      {bagOpen && (
        <>
          <div className="yb-scrim" onClick={() => setBagOpen(false)} />
          <aside className="yb-drawer">
            <div className="yb-row">
              <h2>Your bag</h2>
              <button className="yb-iconbtn" onClick={() => setBagOpen(false)} aria-label="Close"><Icon n="close" /></button>
            </div>
            {bagLines.length === 0 ? (
              lastOrder ? (
                <div className="yb-ok">
                  <p><strong>Order #{lastOrder.ref} saved.</strong> Finish it on WhatsApp so we can confirm.</p>
                  <a className="yb-gold yb-wa" href={lastOrder.url} target="_blank" rel="noreferrer">Open WhatsApp again</a>
                </div>
              ) : (
                <p className="yb-note">Your bag is empty.</p>
              )
            ) : (
              <>
                {bagLines.map((x) => (
                  <div key={x.key} className="yb-line">
                    {x.p.images[0] && <img src={x.p.images[0]} alt="" />}
                    <div>
                      <h3>{x.p.name}</h3>
                      {detail(x) && <small className="yb-desc">{detail(x)}</small>}
                      <div><strong>{money(x.p.price)}</strong></div>
                    </div>
                    <button className="yb-link" onClick={() => setBag(bag.filter((i) => i.key !== x.key))}>Remove</button>
                  </div>
                ))}
                <div className="yb-total"><span>Total</span><strong>{money(total)}</strong></div>
                {orderError && <p className="yb-err" role="alert">{orderError}</p>}
                <button className="yb-gold yb-wa" onClick={() => void checkout()} disabled={placing}>
                  {placing ? "Saving your order..." : "Checkout on WhatsApp"}
                </button>
              </>
            )}
          </aside>
        </>
      )}

      <footer className="yb-info">
        <h2>Good to know</h2>
        {INFO.filter((i) => i.text.trim()).map((i) => (
          <div key={i.title}>
            <h3>{i.title}</h3>
            <p>{i.text}</p>
          </div>
        ))}
        <a className="yb-link" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noreferrer">
          Questions? Chat with us on WhatsApp
        </a>
      </footer>

      <nav className="yb-nav">
        <button onClick={() => { setCat("All"); setOnlySaved(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Icon n="home" />Home</button>
        <button onClick={() => { setOnlySaved(false); go("shop"); document.getElementById("yb-q")?.focus(); }}><Icon n="grid" />Browse</button>
        <button className={onlySaved ? "on" : ""} onClick={() => { setOnlySaved(true); go("shop"); }}><Icon n="heart" />Saved</button>
        <button onClick={() => setBagOpen(true)}><Icon n="bag" />Bag</button>
      </nav>
    </div>
  );
}