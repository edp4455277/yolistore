import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase, type ProductRow } from "../lib/supabase";
import { CATEGORIES } from "../lib/options";
import { orderRef, type OrderRow, type OrderStatus } from "../lib/orders";
import "./admin.css";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const BUCKET = "product-images";
const MAX_FILE_MB = 15; // reject anything bigger before we even try
const MAX_DIMENSION = 1600; // photos are shrunk to this on the longest side
const MAX_PHOTOS = 8;

const CONDITIONS = ["Like new", "Very good", "Good", "Has a small flaw (see description)"];

const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "One size"];
const COLOR_PRESETS = [
  "Black", "White", "Cream", "Beige", "Brown", "Grey",
  "Navy", "Blue", "Green", "Red", "Pink", "Yellow", "Multi",
];

/* ------------------------------------------------------------------ */
/* Types + helpers                                                     */
/* ------------------------------------------------------------------ */

type SB = NonNullable<typeof supabase>;

type ProductForm = {
  title: string;
  description: string;
  category: string;
  price: string;
  original_price: string;
  sizes: string[];
  colors: string[];
  imgs: string[];
  condition: string;
  measurements: string;
  sold: boolean;
};

type ProductRowPlus = ProductRow & { condition?: string | null; measurements?: string | null };

type Msg = { kind: "ok" | "error" | "info"; text: string } | null;

const blank: ProductForm = {
  title: "",
  description: "",
  category: CATEGORIES[0],
  price: "",
  original_price: "",
  sizes: [],
  colors: [],
  imgs: [],
  condition: "",
  measurements: "",
  sold: false,
};

const parseImages = (row: ProductRow): string[] => {
  const list = row.images?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return list.length ? list : row.image_url ? [row.image_url] : [];
};

// Public URLs look like  .../storage/v1/object/public/<bucket>/<path>
const URL_MARKER = `/object/public/${BUCKET}/`;
const pathFromUrl = (url: string): string | null => {
  const i = url.indexOf(URL_MARKER);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + URL_MARKER.length).split("?")[0]);
};

type Prepared = { blob: Blob; ext: string; type: string };

/** Shrinks big phone photos so uploads are fast and the shop loads quickly. */
async function prepareImage(file: File): Promise<Prepared> {
  const original: Prepared = {
    blob: file,
    ext: (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg",
    type: file.type || "image/jpeg",
  };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (blob && blob.size < file.size) return { blob, ext: "jpg", type: "image/jpeg" };
    return original;
  } catch {
    return original; // e.g. a format the browser can't decode: upload as-is
  }
}

/* ------------------------------------------------------------------ */
/* Small reusable pieces                                               */
/* ------------------------------------------------------------------ */

function ChipPicker(props: {
  label: string;
  presets: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const { label, presets, value, onChange, placeholder } = props;
  const [draft, setDraft] = useState("");
  const options = [...presets, ...value.filter((v) => !presets.includes(v))];

  const toggle = (item: string) =>
    onChange(value.includes(item) ? value.filter((v) => v !== item) : [...value, item]);

  const addDraft = () => {
    const text = draft.trim();
    if (!text) return;
    const match = options.find((o) => o.toLowerCase() === text.toLowerCase()) ?? text;
    if (!value.includes(match)) onChange([...value, match]);
    setDraft("");
  };

  return (
    <div className="ad-field">
      <p className="ad-lab">{label}</p>
      <div className="ad-chips">
        {options.map((item) => (
          <button
            type="button"
            key={item}
            className={value.includes(item) ? "ad-chip on" : "ad-chip"}
            aria-pressed={value.includes(item)}
            onClick={() => toggle(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="ad-add">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
        />
        <button type="button" onClick={addDraft}>Add</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

export default function Admin() {
  return supabase
    ? <Panel sb={supabase} />
    : <p className="ad-note">Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

function Panel({ sb }: { sb: SB }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [form, setForm] = useState<ProductForm>(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const [savedImgs, setSavedImgs] = useState<string[]>([]); // photos already stored for the product being edited
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0); // number of photos currently uploading
  const [dragging, setDragging] = useState(false);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "sold">("all");
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [orders, setOrders] = useState<OrderRow[]>([]);

  // untyped handle for the orders table and the new product columns
  const db = sb as unknown as SupabaseClient;

  const userId = session?.user.id ?? null;

  const say = (kind: "ok" | "error" | "info", text: string) => setMsg({ kind, text });

  /* ---------------- auth: one source of truth ---------------- */

  useEffect(() => {
    let active = true;

    // The listener is the ONLY thing that decides who is signed in.
    // (Never call other supabase methods inside this callback.)
    const { data } = sb.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      setReady(true);
      if (event === "SIGNED_OUT") setRows([]);
    });

    // Fallback for slow/old clients: unblock the UI once the stored session is read.
    sb.auth.getSession().then(({ data: current, error }) => {
      if (!active) return;
      if (error) say("error", error.message);
      setSession((prev) => prev ?? current.session);
      setReady(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [sb]);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      say("error", `Could not load products: ${error.message}`);
      return;
    }
    setRows(data ?? []);
  }, [sb]);

  const loadOrders = useCallback(async () => {
    const { data, error } = await db
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      say("error", `Could not load orders: ${error.message}`);
      return;
    }
    setOrders((data ?? []) as OrderRow[]);
  }, [db]);

  // Keyed on the user id, so a silent token refresh does not reload everything.
  useEffect(() => {
    if (userId) {
      void load();
      void loadOrders();
    }
  }, [userId, load, loadOrders]);

  // "Saved." style messages fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (msg?.kind !== "ok") return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  const signIn = async () => {
    if (!login.email.trim() || !login.password) {
      say("error", "Enter your email and password.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await sb.auth.signInWithPassword({
      email: login.email.trim(),
      password: login.password,
    });
    setBusy(false);
    if (error) say("error", error.message);
    // On success the listener above sets the session. Nothing else to do.
  };

  const signOut = async () => {
    await sb.auth.signOut();
    setForm(blank);
    setEditId(null);
    setSavedImgs([]);
  };

  /* ---------------- storage ---------------- */

  const removeFromStorage = async (urls: string[]) => {
    const paths = urls.map(pathFromUrl).filter((p): p is string => Boolean(p));
    if (!paths.length) return;
    const { error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) console.warn("Could not delete old photos:", error.message);
  };

  const uploadOne = async (file: File): Promise<string> => {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_FILE_MB} MB.`);
    const { blob, ext, type } = await prepareImage(file);
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error(`${file.name}: ${error.message}`);
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const addPhotos = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;

    const room = MAX_PHOTOS - form.imgs.length;
    if (room <= 0) {
      say("error", `You can add up to ${MAX_PHOTOS} photos per product.`);
      return;
    }
    const batch = files.slice(0, room);

    setUploading((n) => n + batch.length);
    say("info", `Uploading ${batch.length} photo${batch.length > 1 ? "s" : ""}...`);

    const results = await Promise.allSettled(batch.map(uploadOne));
    setUploading((n) => n - batch.length);

    const urls: string[] = [];
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") urls.push(r.value);
      else errors.push(r.reason instanceof Error ? r.reason.message : "Upload failed.");
    }
    if (files.length > room) errors.push(`Only ${room} more photo${room > 1 ? "s" : ""} fit, the rest were skipped.`);

    // Keep every photo that did upload, even if another one failed.
    if (urls.length) setForm((cur) => ({ ...cur, imgs: [...cur.imgs, ...urls] }));
    if (errors.length) say("error", errors.join(" "));
    else say("ok", `${urls.length} photo${urls.length > 1 ? "s" : ""} added.`);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    void addPhotos(e.dataTransfer.files);
  };

  const dropPhoto = (url: string) => {
    setForm((cur) => ({ ...cur, imgs: cur.imgs.filter((i) => i !== url) }));
    // A photo uploaded in this session but never saved is safe to delete right away.
    if (!savedImgs.includes(url)) void removeFromStorage([url]);
  };

  const makeCover = (url: string) =>
    setForm((cur) => ({ ...cur, imgs: [url, ...cur.imgs.filter((i) => i !== url)] }));

  const move = (index: number, dir: -1 | 1) =>
    setForm((cur) => {
      const next = [...cur.imgs];
      const to = index + dir;
      if (to < 0 || to >= next.length) return cur;
      [next[index], next[to]] = [next[to], next[index]];
      return { ...cur, imgs: next };
    });

  /* ---------------- product actions ---------------- */

  const resetForm = () => {
    setForm(blank);
    setEditId(null);
    setSavedImgs([]);
  };

  const cancelEdit = () => {
    // Throw away anything uploaded but never saved.
    const orphans = form.imgs.filter((u) => !savedImgs.includes(u));
    if (orphans.length) void removeFromStorage(orphans);
    resetForm();
    setMsg(null);
  };

  const save = async () => {
    const price = parseFloat(form.price);
    const originalPrice = form.original_price.trim() ? parseFloat(form.original_price) : null;

    if (!form.title.trim()) return say("error", "Add a product name.");
    if (!Number.isFinite(price) || price <= 0) return say("error", "Enter a valid price.");
    if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice <= 0))
      return say("error", "Enter a valid old price or leave it blank.");
    if (uploading > 0) return say("info", "Wait for photos to finish uploading.");

    setBusy(true);
    const product = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      price_zmw: price,
      original_price_zmw: originalPrice,
      sizes: form.sizes,
      colors: form.colors,
      image_url: form.imgs[0] ?? null,
      images: form.imgs.length ? form.imgs.join(",") : null,
      condition: form.condition || null,
      measurements: form.measurements.trim() || null,
      sold: form.sold,
    };

    const { error } = editId
      ? await db.from("products").update(product).eq("id", editId)
      : await db.from("products").insert(product);

    if (error) {
      setBusy(false);
      return say("error", `Could not save: ${error.message}`);
    }

    // Clean up photos that were removed from this product.
    const removed = savedImgs.filter((u) => !form.imgs.includes(u));
    if (removed.length) await removeFromStorage(removed);

    setBusy(false);
    resetForm();
    say("ok", editId ? "Changes saved." : "Product added.");
    await load();
  };

  const edit = (row: ProductRow) => {
    const images = parseImages(row);
    setForm({
      title: row.title,
      description: row.description ?? "",
      category: row.category ?? CATEGORIES[0],
      price: String(row.price_zmw),
      original_price: row.original_price_zmw == null ? "" : String(row.original_price_zmw),
      sizes: row.sizes ?? [],
      colors: row.colors ?? [],
      imgs: images,
      condition: (row as ProductRowPlus).condition ?? "",
      measurements: (row as ProductRowPlus).measurements ?? "",
      sold: row.sold,
    });
    setSavedImgs(images);
    setEditId(row.id);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (row: ProductRow) => {
    if (!confirm(`Delete "${row.title}"? This can't be undone.`)) return;
    const { error } = await sb.from("products").delete().eq("id", row.id);
    if (error) return say("error", `Could not delete: ${error.message}`);
    await removeFromStorage(parseImages(row));
    if (editId === row.id) resetForm();
    say("ok", "Product deleted.");
    await load();
  };

  const toggleSold = async (row: ProductRow) => {
    const { error } = await sb.from("products").update({ sold: !row.sold }).eq("id", row.id);
    if (error) return say("error", error.message);
    await load();
  };

  const setOrderStatus = async (order: OrderRow, status: OrderStatus) => {
    if (status === "cancelled" && !confirm("Cancel this order and put its pieces back on sale?")) return;
    const { error } = await db.from("orders").update({ status }).eq("id", order.id);
    if (error) return say("error", error.message);
    if (status === "cancelled") {
      const { error: relistError } = await db
        .from("products")
        .update({ sold: false })
        .in("id", order.items.map((i) => i.id));
      if (relistError) say("error", `Order cancelled, but could not relist: ${relistError.message}`);
      else say("ok", "Order cancelled and pieces relisted.");
      await load();
    }
    await loadOrders();
  };

  /* ---------------- derived ---------------- */

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "available" && r.sold) return false;
      if (filter === "sold" && !r.sold) return false;
      if (!q) return true;
      return r.title.toLowerCase().includes(q) || (r.category ?? "").toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  const soldCount = rows.filter((r) => r.sold).length;
  const newOrders = orders.filter((o) => o.status === "new").length;

  /* ---------------- render ---------------- */

  if (!ready) return <p className="ad-note">Loading...</p>;

  if (!session) {
    return (
      <div className="ad">
        <div className="ad-box ad-login">
          <h1>Yolique admin</h1>
          <input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={login.email}
            onChange={(e) => setLogin({ ...login, email: e.target.value })}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={login.password}
            onChange={(e) => setLogin({ ...login, password: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") void signIn();
            }}
          />
          <button className="ad-gold" disabled={busy} onClick={() => void signIn()}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
          {msg && <p className={`ad-msg ${msg.kind}`}>{msg.text}</p>}
        </div>
      </div>
    );
  }

  const categories = CATEGORIES.includes(form.category) ? CATEGORIES : [form.category, ...CATEGORIES];

  return (
    <div className="ad">
      <header className="ad-top">
        <h1>Yolique admin</h1>
        <div>
          <a href="#/">View store</a>
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

      {msg && (
        <p className={`ad-msg ad-toast ${msg.kind}`} role="status">
          {msg.text}
          {msg.kind === "error" && <button onClick={() => setMsg(null)} aria-label="Dismiss">x</button>}
        </p>
      )}

      <nav className="ad-tabs">
        <button className={tab === "products" ? "on" : ""} onClick={() => setTab("products")}>Products</button>
        <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>
          Orders{newOrders > 0 && <span className="ad-dot">{newOrders}</span>}
        </button>
      </nav>

      {tab === "orders" && (
        <section className="ad-list">
          <h2>
            Orders ({orders.length})
            <button className="ad-refresh" onClick={() => void loadOrders()}>Refresh</button>
          </h2>
          {orders.length === 0 && (
            <p className="ad-note">No orders yet. They appear here when a customer sends a bag on WhatsApp.</p>
          )}
          {orders.map((order) => (
            <div key={order.id} className={`ad-order ${order.status}`}>
              <div className="ad-order-top">
                <strong>#{orderRef(order.id)}</strong>
                <span className={`ad-badge ${order.status}`}>{order.status}</span>
                <small>{new Date(order.created_at).toLocaleString()}</small>
              </div>
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.title}
                      {(item.size || item.color) && (
                        <small className="ad-line-opts"> ({[item.size && `Size ${item.size}`, item.color].filter(Boolean).join(", ")})</small>
                      )}
                    </span>
                    <span>K{Number(item.price_zmw).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <p className="ad-total">Total K{Number(order.total_zmw).toLocaleString()}</p>
              {(order.customer_name || order.customer_phone || order.delivery_area || order.note) && (
                <small>
                  {[order.customer_name, order.customer_phone, order.delivery_area, order.note]
                    .filter(Boolean)
                    .join(" | ")}
                </small>
              )}
              {order.status !== "cancelled" && order.status !== "delivered" && (
                <div className="ad-acts">
                  {order.status === "new" && (
                    <button onClick={() => void setOrderStatus(order, "confirmed")}>Mark paid / confirmed</button>
                  )}
                  <button onClick={() => void setOrderStatus(order, "delivered")}>Delivered</button>
                  <button onClick={() => void setOrderStatus(order, "cancelled")}>Cancel and relist</button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {tab === "products" && (<>
      <section className="ad-box">
        <h2>{editId ? "Edit product" : "Add product"}</h2>

        <label>
          Name
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>

        <label>
          Description
          <textarea rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>

        <label>
          Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>

        <div className="ad-two">
          <label>
            Condition
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
              <option value="">Not set</option>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Measurements (optional)
            <input value={form.measurements} placeholder="Chest 52cm, length 70cm"
              onChange={(e) => setForm({ ...form, measurements: e.target.value })} />
          </label>
        </div>

        <div className="ad-two">
          <label>
            Price (K)
            <input type="text" inputMode="decimal" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>
          <label>
            Old price (K, optional)
            <input type="text" inputMode="decimal" value={form.original_price}
              onChange={(e) => setForm({ ...form, original_price: e.target.value })} />
          </label>
        </div>

        <ChipPicker
          label="Sizes available"
          presets={SIZE_PRESETS}
          value={form.sizes}
          onChange={(sizes) => setForm((cur) => ({ ...cur, sizes }))}
          placeholder="Other size, e.g. 38 or 10"
        />

        <ChipPicker
          label="Colours"
          presets={COLOR_PRESETS}
          value={form.colors}
          onChange={(colors) => setForm((cur) => ({ ...cur, colors }))}
          placeholder="Other colour, e.g. olive"
        />

        <div className="ad-field">
          <p className="ad-lab">Photos ({form.imgs.length}/{MAX_PHOTOS}). The first one is the cover.</p>
          <label
            className={dragging ? "ad-drop over" : "ad-drop"}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            {uploading > 0
              ? `Uploading ${uploading} photo${uploading > 1 ? "s" : ""}...`
              : "Tap to choose photos, or drop them here"}
          </label>

          <div className="ad-thumbs">
            {form.imgs.map((url, index) => (
              <div key={url} className="ad-thumb">
                <img src={url} alt="" />
                {index === 0 && <span className="ad-cover">Cover</span>}
                <div className="ad-thumb-acts">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move earlier">&lt;</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === form.imgs.length - 1} aria-label="Move later">&gt;</button>
                  {index > 0 && <button type="button" onClick={() => makeCover(url)}>Cover</button>}
                  <button type="button" onClick={() => dropPhoto(url)}>Remove</button>
                </div>
              </div>
            ))}
            {Array.from({ length: uploading }).map((_, i) => (
              <div key={`pending-${i}`} className="ad-thumb pending">...</div>
            ))}
          </div>
        </div>

        <label className="ad-check">
          <input type="checkbox" checked={form.sold}
            onChange={(e) => setForm({ ...form, sold: e.target.checked })} />
          Mark as sold
        </label>

        <div className="ad-actions">
          <button className="ad-gold" disabled={busy || uploading > 0} onClick={() => void save()}>
            {busy ? "Saving..." : editId ? "Save changes" : "Add product"}
          </button>
          {editId && <button onClick={cancelEdit}>Cancel edit</button>}
        </div>
      </section>

      <section className="ad-list">
        <h2>
          Products ({rows.length}
          {soldCount > 0 && `, ${soldCount} sold`})
        </h2>

        <div className="ad-toolbar">
          <input
            type="search"
            placeholder="Search by name or category"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="ad-seg">
            {(["all", "available", "sold"] as const).map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "available" ? "Available" : "Sold"}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 && (
          <p className="ad-note">{rows.length === 0 ? "No products yet. Add your first one above." : "Nothing matches."}</p>
        )}

        {visible.map((row) => (
          <div key={row.id} className={row.sold ? "ad-row sold" : "ad-row"}>
            {row.image_url ? <img src={row.image_url} alt="" /> : <span className="ad-ph" />}
            <div className="ad-info">
              <strong>{row.title}</strong>
              <small>
                K{row.price_zmw.toLocaleString()} | {row.category}
                {row.sold ? " | SOLD" : ""}
              </small>
              {(row.sizes?.length || row.colors?.length) ? (
                <small>{[...(row.sizes ?? []), ...(row.colors ?? [])].join(", ")}</small>
              ) : null}
            </div>
            <div className="ad-acts">
              <button onClick={() => edit(row)}>Edit</button>
              <button onClick={() => void toggleSold(row)}>{row.sold ? "Relist" : "Sold"}</button>
              <button onClick={() => void remove(row)}>Delete</button>
            </div>
          </div>
        ))}
      </section>
      </>)}
    </div>
  );
}