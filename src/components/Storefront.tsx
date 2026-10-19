import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import "./shop.css";

const WHATSAPP_NUMBER = "260771699256"; // TODO: your store number, digits only (copy it from your live site code)
const PAGE_SIZE = 12;

type Product = {
  id: string | number;
  title: string;
  description?: string | null;
  price_zmw: number;
  category?: string | null;
  image_url?: string | null;
  size?: string | null;
  color?: string | null;
  is_new?: boolean | null;
  thrifted?: boolean | null;
  sold?: boolean | null;
  images?: string | null; // comma-separated photo urls
  original_price_zmw?: number | null;
};

type BagItem = {
  key: string;
  product: Product;
  size: string;
  color: string;
  qty: number;
};

type Sort = "newest" | "low" | "high";

const money = (n: number) => `K${Number(n).toLocaleString("en-US")}`;
const parts = (s?: string | null) =>
  (s ?? "")
    .split(/[,/]/)
    .map((x) => x.trim())
    .filter(Boolean);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const Icon = {
  bag: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </svg>
  ),
  heart: (filled: boolean, size = 22) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  ),
};

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("newest");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [onlyThrifted, setOnlyThrifted] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [view, setView] = useState<"all" | "saved">("all");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [bag, setBag] = useState<BagItem[]>(() => read<BagItem[]>("yb-bag", []));
  const [saved, setSaved] = useState<Array<string | number>>(() => read<Array<string | number>>("yb-saved", []));

  const gridRef = useRef<HTMLElement | null>(null);

  // Fetch once; all filtering happens in the browser so nothing reloads or jumps.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) {
        setError("Store connection isn't set up. Check your .env keys.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (!alive) return;
      if (error) setError("Couldn't load products. Check your connection and refresh.");
      else setProducts((data as Product[]) ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("yb-bag", JSON.stringify(bag));
    } catch {
      /* storage unavailable */
    }
  }, [bag]);

  useEffect(() => {
    try {
      localStorage.setItem("yb-saved", JSON.stringify(saved));
    } catch {
      /* storage unavailable */
    }
  }, [saved]);

  const sheetOpen = filtersOpen || bagOpen || !!selected;
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheetOpen]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    });
    return [["All", products.length] as [string, number], ...Array.from(counts.entries())];
  }, [products]);

  const sizeOptions = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => new Set(parts(p.size)).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)));
    const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "One size"];
    const rank = (v: string) => (order.indexOf(v) === -1 ? 99 : order.indexOf(v));
    return Array.from(m.entries()).sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [products]);
  const colorOptions = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => new Set(parts(p.color)).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = priceMin === "" ? null : Number(priceMin);
    const max = priceMax === "" ? null : Number(priceMax);
    let list = products.filter((p) => {
      if (view === "saved" && !saved.includes(p.id)) return false;
      if (onlyThrifted && !p.thrifted) return false;
      if (onlyNew && !p.is_new) return false;
      if (min !== null && p.price_zmw < min) return false;
      if (max !== null && p.price_zmw > max) return false;
      if (category !== "All" && p.category !== category) return false;
      if (q && !`${p.title} ${p.category ?? ""}`.toLowerCase().includes(q)) return false;
      if (sizes.length && !parts(p.size).some((s) => sizes.includes(s))) return false;
      if (colors.length && !parts(p.color).some((c) => colors.includes(c))) return false;
      return true;
    });
    if (sort === "low") list = [...list].sort((a, b) => a.price_zmw - b.price_zmw);
    if (sort === "high") list = [...list].sort((a, b) => b.price_zmw - a.price_zmw);
    // sold pieces drift to the end of the list
    return [...list].sort((a, b) => Number(!!a.sold) - Number(!!b.sold));
  }, [products, query, category, sizes, colors, sort, view, saved, priceMin, priceMax, onlyThrifted, onlyNew]);

  useEffect(
    () => setVisible(PAGE_SIZE),
    [query, category, sizes, colors, sort, view, priceMin, priceMax, onlyThrifted, onlyNew]
  );

  const shown = filtered.slice(0, visible);
  const bagCount = bag.reduce((n, i) => n + i.qty, 0);
  const bagTotal = bag.reduce((n, i) => n + i.qty * i.product.price_zmw, 0);
  const activeFilters =
    sizes.length +
    colors.length +
    (sort !== "newest" ? 1 : 0) +
    (priceMin !== "" || priceMax !== "" ? 1 : 0) +
    (onlyThrifted ? 1 : 0) +
    (onlyNew ? 1 : 0);

  const clearFilters = () => {
    setSizes([]);
    setColors([]);
    setSort("newest");
    setPriceMin("");
    setPriceMax("");
    setOnlyThrifted(false);
    setOnlyNew(false);
  };

  const sortLabel = sort === "low" ? "Price: low to high" : "Price: high to low";

  const toggleSaved = (id: string | number) =>
    setSaved((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const goToGrid = () => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  function addToBag(product: Product, size: string, color: string) {
    const key = `${product.id}|${size}|${color}`;
    setBag((prev) => {
      const found = prev.find((i) => i.key === key);
      if (found) return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { key, product, size, color, qty: 1 }];
    });
    setSelected(null);
    setBagOpen(true);
  }

  function changeQty(key: string, delta: number) {
    setBag((prev) =>
      prev.map((i) => (i.key === key ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0)
    );
  }

  function checkout() {
    const lines = bag.map((i) => {
      const opts = [i.size, i.color].filter(Boolean).join(", ");
      return `${i.qty} x ${i.product.title}${opts ? ` (${opts})` : ""} - ${money(i.qty * i.product.price_zmw)}`;
    });
    const text = `Hi Yolique Boutique, I'd like to order:\n${lines.join("\n")}\nTotal: ${money(bagTotal)}`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, "_blank");
  }

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const heading = view === "saved" ? "Saved pieces" : category === "All" ? "Featured pieces" : category;

  return (
    <div className="yb">
      <header className="yb-top">
        <h1 className="yb-logo">
          Yolique <em>Boutique</em>
        </h1>
        <button className="yb-iconbtn" onClick={() => setBagOpen(true)} aria-label={`Open bag, ${bagCount} items`}>
          {Icon.bag}
          {bagCount > 0 && <span className="yb-badge">{bagCount}</span>}
        </button>
      </header>

      <section className="yb-hero" id="home">
        <h2>
          Thrift fashion,
          <br />
          redefined.
        </h2>
        <p>Hand-picked, one-of-one pieces. Order in seconds on WhatsApp.</p>
        <button
          className="yb-cta"
          onClick={() => {
            setView("all");
            goToGrid();
          }}
        >
          Shop the collection
        </button>
      </section>

      <div className="yb-wrap">
        <label className="yb-search">
          {Icon.search}
          <input
            type="search"
            placeholder="Search dresses, jeans, bags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <h3 className="yb-h">Shop by category</h3>
        <div className="yb-pills" role="tablist">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <span className="yb-pill yb-skel ghost" key={i} />)
            : categories.map(([name, count]) => (
                <button
                  key={name}
                  role="tab"
                  aria-selected={category === name}
                  className={`yb-pill${category === name ? " on" : ""}`}
                  onClick={() => {
                    setCategory(name);
                    setView("all");
                  }}
                >
                  {name} <span className="yb-n">{count}</span>
                </button>
              ))}
        </div>

        <section className="yb-grid-sec" ref={gridRef}>
          <div className="yb-sechead">
            <h3 className="yb-h">{heading}</h3>
            <button className="yb-filter" onClick={() => setFiltersOpen(true)}>
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
            </button>
          </div>

          {activeFilters > 0 && (
            <div className="yb-applied">
              {sizes.map((v) => (
                <button key={`s-${v}`} className="yb-chip" onClick={() => toggle(sizes, setSizes, v)}>
                  Size {v} <span aria-hidden>×</span>
                </button>
              ))}
              {colors.map((v) => (
                <button key={`c-${v}`} className="yb-chip" onClick={() => toggle(colors, setColors, v)}>
                  {v} <span aria-hidden>×</span>
                </button>
              ))}
              {(priceMin !== "" || priceMax !== "") && (
                <button
                  className="yb-chip"
                  onClick={() => {
                    setPriceMin("");
                    setPriceMax("");
                  }}
                >
                  K{priceMin || "0"} to {priceMax ? `K${priceMax}` : "any"} <span aria-hidden>×</span>
                </button>
              )}
              {onlyThrifted && (
                <button className="yb-chip" onClick={() => setOnlyThrifted(false)}>
                  Thrifted <span aria-hidden>×</span>
                </button>
              )}
              {onlyNew && (
                <button className="yb-chip" onClick={() => setOnlyNew(false)}>
                  New <span aria-hidden>×</span>
                </button>
              )}
              {sort !== "newest" && (
                <button className="yb-chip" onClick={() => setSort("newest")}>
                  {sortLabel} <span aria-hidden>×</span>
                </button>
              )}
              <button className="yb-clear" onClick={clearFilters}>
                Clear all
              </button>
            </div>
          )}

          {error && <p className="yb-note">{error}</p>}

          <div className="yb-grid">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div className="yb-card" key={i} aria-hidden>
                  <div className="yb-img yb-skel" />
                  <div className="yb-line yb-skel" />
                  <div className="yb-line short yb-skel" />
                </div>
              ))}

            {!loading &&
              shown.map((p) => {
                const isSaved = saved.includes(p.id);
                return (
                  <article className={`yb-card${p.sold ? " sold" : ""}`} key={p.id}>
                    <button className="yb-open" onClick={() => setSelected(p)}>
                      <div className="yb-img">
                        {p.image_url && <img src={p.image_url} alt={p.title} loading="lazy" decoding="async" />}
                        {(p.sold || p.is_new || p.thrifted) && (
                          <span className="yb-tags">
                            {p.sold && <span className="yb-tag">Sold</span>}
                            {!p.sold && p.is_new && <span className="yb-tag gold">New</span>}
                            {p.thrifted && <span className="yb-tag">Thrifted</span>}
                          </span>
                        )}
                      </div>
                      <span className="yb-name">{p.title}</span>
                      <span className="yb-price">
                        {money(p.price_zmw)}
                        {p.original_price_zmw && p.original_price_zmw > p.price_zmw ? <s>{money(p.original_price_zmw)}</s> : null}
                      </span>
                    </button>
                    <button
                      className={`yb-heart${isSaved ? " on" : ""}`}
                      onClick={() => toggleSaved(p.id)}
                      aria-label={isSaved ? "Remove from saved" : "Save"}
                      aria-pressed={isSaved}
                    >
                      {Icon.heart(isSaved, 18)}
                    </button>
                  </article>
                );
              })}
          </div>

          {!loading && !error && filtered.length === 0 && (
            <p className="yb-note">
              {view === "saved"
                ? "Nothing saved yet. Tap the heart on a piece to keep it here."
                : "Nothing matches. Try clearing a filter or search."}
            </p>
          )}

          {!loading && filtered.length > PAGE_SIZE && (
            <div className="yb-more">
              <p>
                Showing {shown.length} of {filtered.length} pieces
              </p>
              <div className="yb-progress">
                <span style={{ width: `${(shown.length / filtered.length) * 100}%` }} />
              </div>
              {shown.length < filtered.length && (
                <button className="yb-outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Load more
                </button>
              )}
            </div>
          )}
        </section>

        <footer className="yb-foot">Curated. Stylish. Sustainable.</footer>
      </div>

      {/* Bottom navigation */}
      <nav className="yb-nav" aria-label="Main">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          {Icon.home}
          <span>Home</span>
        </button>
        <button
          className={view === "all" ? "on" : ""}
          onClick={() => {
            setView("all");
            goToGrid();
          }}
        >
          {Icon.grid}
          <span>Browse</span>
        </button>
        <button
          className={view === "saved" ? "on" : ""}
          onClick={() => {
            setView("saved");
            setCategory("All");
            goToGrid();
          }}
        >
          {Icon.heart(view === "saved")}
          <span>Saved{saved.length > 0 ? ` (${saved.length})` : ""}</span>
        </button>
        <button onClick={() => setBagOpen(true)}>
          <span className="yb-navbag">
            {Icon.bag}
            {bagCount > 0 && <span className="yb-badge">{bagCount}</span>}
          </span>
          <span>Bag</span>
        </button>
      </nav>

      {/* Filters drawer: every option is visible, changes apply live */}
      {filtersOpen && (
        <div className="yb-full" role="dialog" aria-label="Filters">
          <div className="yb-fbar">
            <h3>Filters</h3>
            <button className="yb-x" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              ×
            </button>
          </div>

          <div className="yb-filters">
            <Group title="Sort by">
              <Opt on={sort === "newest"} onClick={() => setSort("newest")}>
                Newest
              </Opt>
              <Opt on={sort === "low"} onClick={() => setSort("low")}>
                Price: low to high
              </Opt>
              <Opt on={sort === "high"} onClick={() => setSort("high")}>
                Price: high to low
              </Opt>
            </Group>

            <Group title="Category">
              {categories.map(([name, count]) => (
                <Opt key={name} on={category === name} onClick={() => setCategory(name)}>
                  {name} <small>{count}</small>
                </Opt>
              ))}
            </Group>

            {sizeOptions.length > 0 && (
              <Group title="Size" hint="Tap every size that fits you">
                {sizeOptions.map(([name, count]) => (
                  <Opt key={name} on={sizes.includes(name)} onClick={() => toggle(sizes, setSizes, name)}>
                    {name} <small>{count}</small>
                  </Opt>
                ))}
              </Group>
            )}

            {colorOptions.length > 0 && (
              <Group title="Colour" hint="Tap every colour you like">
                {colorOptions.map(([name, count]) => (
                  <Opt key={name} on={colors.includes(name)} onClick={() => toggle(colors, setColors, name)}>
                    {name} <small>{count}</small>
                  </Opt>
                ))}
              </Group>
            )}

            <Group title="Price (K)">
              <div className="yb-range">
                <label>
                  <span>From</span>
                  <input
                    inputMode="numeric"
                    placeholder="0"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    inputMode="numeric"
                    placeholder="Any"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
              </div>
            </Group>

            <Group title="Show only">
              <Opt on={onlyNew} onClick={() => setOnlyNew(!onlyNew)}>
                New
              </Opt>
              <Opt on={onlyThrifted} onClick={() => setOnlyThrifted(!onlyThrifted)}>
                Thrifted
              </Opt>
            </Group>
          </div>

          <div className="yb-factions">
            <button className="yb-solid" onClick={() => setFiltersOpen(false)}>
              {filtered.length === 0
                ? "No matches, adjust filters"
                : `View ${filtered.length} ${filtered.length === 1 ? "piece" : "pieces"}`}
            </button>
            <button
              className="yb-text"
              onClick={() => {
                clearFilters();
                setCategory("All");
              }}
              disabled={activeFilters === 0 && category === "All"}
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* Product sheet */}
      {selected && (
        <ProductSheet
          key={selected.id}
          product={selected}
          saved={saved.includes(selected.id)}
          onSave={() => toggleSaved(selected.id)}
          onClose={() => setSelected(null)}
          onAdd={addToBag}
        />
      )}

      {/* Bag sheet */}
      {bagOpen && (
        <div className="yb-overlay" onClick={() => setBagOpen(false)}>
          <div className="yb-sheet" role="dialog" aria-label="Shopping bag" onClick={(e) => e.stopPropagation()}>
            <div className="yb-handle" />
            <div className="yb-sheethead">
              <h3>
                Your bag <sup>{bagCount}</sup>
              </h3>
              <button className="yb-x" onClick={() => setBagOpen(false)} aria-label="Close bag">
                ×
              </button>
            </div>

            {bag.length === 0 ? (
              <div className="yb-empty">
                <p>Your bag is empty</p>
                <button className="yb-outline" onClick={() => setBagOpen(false)}>
                  Keep browsing
                </button>
              </div>
            ) : (
              <>
                <ul className="yb-bag">
                  {bag.map((i) => (
                    <li key={i.key}>
                      <div className="yb-thumb">{i.product.image_url && <img src={i.product.image_url} alt="" />}</div>
                      <div className="yb-bag-info">
                        <span className="yb-bname">{i.product.title}</span>
                        <span className="yb-meta">{[i.size, i.color].filter(Boolean).join(" · ")}</span>
                        <span className="yb-price flat">{money(i.product.price_zmw * i.qty)}</span>
                      </div>
                      <div className="yb-qty">
                        <button onClick={() => changeQty(i.key, -1)} aria-label="Remove one">
                          −
                        </button>
                        <span>{i.qty}</span>
                        <button onClick={() => changeQty(i.key, 1)} aria-label="Add one">
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="yb-total">
                  <span>Total</span>
                  <strong>{money(bagTotal)}</strong>
                </div>
                <button className="yb-solid" onClick={checkout}>
                  Finish order on WhatsApp
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="yb-group">
      <h4>{title}</h4>
      {hint && <p className="yb-hint">{hint}</p>}
      <div className="yb-fopts">{children}</div>
    </section>
  );
}

function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`yb-opt${on ? " on" : ""}`} onClick={onClick} aria-pressed={on}>
      {on && (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      )}
      <span>{children}</span>
    </button>
  );
}

function ProductSheet({
  product,
  saved,
  onSave,
  onClose,
  onAdd,
}: {
  product: Product;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
  onAdd: (p: Product, size: string, color: string) => void;
}) {
  const sizeList = parts(product.size);
  const colorList = parts(product.color);
  const thrifted = !!product.thrifted;
  // Thrifted pieces are one-offs: size and colour are fixed and read-only.
  const [size, setSize] = useState(thrifted || sizeList.length === 1 ? sizeList[0] ?? "" : "");
  const [color, setColor] = useState(thrifted || colorList.length === 1 ? colorList[0] ?? "" : "");
  const [warn, setWarn] = useState(false);
  const imgs = (product.images ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const gallery = imgs.length ? imgs : product.image_url ? [product.image_url] : [];
  const [active, setActive] = useState(0);

  const needSize = !thrifted && sizeList.length > 1;
  const needColor = !thrifted && colorList.length > 1;

  function add() {
    if (product.sold) return;
    if ((needSize && !size) || (needColor && !color)) return setWarn(true);
    onAdd(product, size, color);
  }

  return (
    <div className="yb-overlay" onClick={onClose}>
      <div className="yb-sheet tall" role="dialog" aria-label={product.title} onClick={(e) => e.stopPropagation()}>
        <button className="yb-x float" onClick={onClose} aria-label="Close">
          ×
        </button>
        <button
          className={`yb-x float left${saved ? " on" : ""}`}
          onClick={onSave}
          aria-label={saved ? "Remove from saved" : "Save"}
          aria-pressed={saved}
        >
          {Icon.heart(saved, 20)}
        </button>
        <div className="yb-hero-img">
          {gallery[active] && <img src={gallery[active]} alt={product.title} />}
        </div>
        {gallery.length > 1 && (
          <div className="yb-gallery">
            {gallery.map((u, i) => (
              <button key={u} className={i === active ? "on" : ""} onClick={() => setActive(i)} aria-label={`Photo ${i + 1}`}>
                <img src={u} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className="yb-detail">
          <div className="yb-tags row">
            {product.is_new && <span className="yb-tag gold">New</span>}
            {thrifted && <span className="yb-tag">Thrifted</span>}
          </div>
          <h3>{product.title}</h3>
          <p className="yb-price big">
            {money(product.price_zmw)}
            {product.original_price_zmw && product.original_price_zmw > product.price_zmw ? <s>{money(product.original_price_zmw)}</s> : null}
          </p>
          {product.description && <p className="yb-desc">{product.description}</p>}

          {thrifted ? (
            <p className="yb-meta fixed">
              {[sizeList.join(", "), colorList.join(", ")].filter(Boolean).join(" · ")}
              {" · one of a kind"}
            </p>
          ) : (
            <>
              {sizeList.length > 0 && (
                <div className="yb-pick">
                  <p>Size</p>
                  <div className="yb-fopts">
                    {sizeList.map((s) => (
                      <Opt key={s} on={size === s} onClick={() => setSize(s)}>
                        {s}
                      </Opt>
                    ))}
                  </div>
                </div>
              )}
              {colorList.length > 0 && (
                <div className="yb-pick">
                  <p>Colour</p>
                  <div className="yb-fopts">
                    {colorList.map((c) => (
                      <Opt key={c} on={color === c} onClick={() => setColor(c)}>
                        {c}
                      </Opt>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {warn && <p className="yb-warn">Choose a size and colour first.</p>}
          <button className="yb-solid" onClick={add} disabled={!!product.sold}>
            {product.sold ? "Sold out" : "Add to bag"}
          </button>
        </div>
      </div>
    </div>
  );
}