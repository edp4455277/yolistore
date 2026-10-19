import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { CATEGORIES, SIZES, COLORS } from "../lib/options";
import "./admin.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type SB = NonNullable<typeof supabase>;
// COLORS may be a list (strings or {name, hex} objects) or a name -> code map; handle all of them
type ColorOpt = { name: string; code: string };
const RAW_COLORS: unknown = COLORS;
const COLOR_LIST: ColorOpt[] = (
  Array.isArray(RAW_COLORS)
    ? (RAW_COLORS as unknown[]).map((c) => {
        if (typeof c === "string") return { name: c, code: c };
        const o = c as Record<string, unknown>;
        return {
          name: String(o.name ?? o.label ?? o.title ?? ""),
          code: String(o.hex ?? o.code ?? o.value ?? o.color ?? o.css ?? ""),
        };
      })
    : Object.entries(RAW_COLORS as Record<string, string>).map(([name, code]) => ({ name, code: String(code) }))
).filter((c) => c.name);
const tone = (m: string) => (m === "Saved." ? "ok" : m.startsWith("Uploading") ? "info" : "error");
const split = (v: unknown) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const blank = {
  title: "", description: "", category: CATEGORIES[0], price: "", original: "",
  sizes: [] as string[], colors: [] as string[], imgs: [] as string[], sold: false, thrifted: false, isNew: false,
};

export default function Admin() {
  return supabase ? <Panel sb={supabase} /> : <p className="ad-note">Supabase isn't configured.</p>;
}

function Panel({ sb }: { sb: SB }) {
  // loosely typed handle for the products table (avoids generated-type clashes)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sb as unknown as { from: (t: string) => any };
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [f, setF] = useState(blank);
  const [editId, setEditId] = useState<string | number | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState({ email: "", password: "" });
  // on-screen log of sign-in events (helps find why a session ends)
  const [trail, setTrail] = useState<string[]>([]);
  const note = (t: string) => setTrail((x) => [...x.slice(-7), `${new Date().toLocaleTimeString()}  ${t}`]);

  const load = async () => {
    const { data } = await db.from("products").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((e, s) => {
      console.info("[admin] auth event:", e, s ? "session ok" : "no session");
      note(`${e} ${s ? `(session, lasts ${Math.round((s.expires_at ?? 0) - Date.now() / 1000)}s)` : "(no session)"}`);
      if (!s && e === "SIGNED_OUT") setMsg("You were signed out. Please sign in again.");
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [sb]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session) load(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // A healthy session lasts about an hour. If it's about to expire the moment you sign in,
  // the computer's clock is usually wrong (or the JWT expiry in Supabase is set very low).
  useEffect(() => {
    if (!session?.expires_at) return;
    const secsLeft = session.expires_at - Date.now() / 1000;
    if (secsLeft < 300) {
      setMsg(`Sign-in problem: this session has only ${Math.max(0, Math.round(secsLeft))}s left. Check that your computer's date, time and time zone are correct, and that JWT expiry in Supabase is not set very low.`);
    }
  }, [session]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await sb.auth.signInWithPassword(login);
    note(error ? `sign-in error: ${error.message}` : "sign-in accepted");
    setMsg(error ? error.message : "");
    setBusy(false);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setMsg("Uploading photos...");
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.name.split(".").pop()}`;
      const { error } = await sb.storage.from("product-images").upload(path, file);
      if (error) { setMsg(error.message); setBusy(false); return; }
      urls.push(sb.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    }
    setF((x) => ({ ...x, imgs: [...x.imgs, ...urls] }));
    setMsg(""); setBusy(false);
  };

  const save = async () => {
    if (!f.title.trim() || !f.price) return setMsg("Add a name and a price.");
    setBusy(true);
    const row = {
      title: f.title.trim(), description: f.description, category: f.category,
      price_zmw: Number(f.price), original_price_zmw: f.original ? Number(f.original) : null,
      size: f.sizes.join(", "), color: f.colors.join(", "),
      image_url: f.imgs[0] ?? null, images: f.imgs.join(","), sold: f.sold, thrifted: f.thrifted, is_new: f.isNew,
    };
    const { error } = editId
      ? await db.from("products").update(row).eq("id", editId)
      : await db.from("products").insert(row);
    setBusy(false);
    if (error) return setMsg(error.message);
    setF(blank); setEditId(null); setMsg("Saved."); load();
  };

  const edit = (r: Row) => {
    const imgs = split(r.images);
    setF({
      title: r.title ?? "", description: r.description ?? "", category: r.category ?? CATEGORIES[0],
      price: String(r.price_zmw ?? ""), original: r.original_price_zmw ? String(r.original_price_zmw) : "",
      sizes: split(r.size), colors: split(r.color),
      imgs: imgs.length ? imgs : r.image_url ? [r.image_url] : [], sold: !!r.sold, thrifted: !!r.thrifted, isNew: !!r.is_new,
    });
    setEditId(r.id); setMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (r: Row) => {
    if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return;
    const { error } = await db.from("products").delete().eq("id", r.id);
    if (error) setMsg(error.message); else load();
  };

  const toggleSold = async (r: Row) => {
    const { error } = await db.from("products").update({ sold: !r.sold }).eq("id", r.id);
    if (error) setMsg(error.message); else load();
  };

  const tog = (k: "sizes" | "colors", v: string) =>
    setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }));

  if (!ready) return null;

  if (!session) {
    return (
      <div className="ad">
        <div className="ad-box">
          <h1>Yolique admin</h1>
          <input type="email" placeholder="Email" value={login.email}
            onChange={(e) => setLogin({ ...login, email: e.target.value })} />
          <input type="password" placeholder="Password" value={login.password}
            onChange={(e) => setLogin({ ...login, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && signIn()} />
          <button className="ad-gold" disabled={busy} onClick={signIn}>Sign in</button>
          {msg && <p className={`ad-msg ${tone(msg)}`}>{msg}</p>}
          {trail.length > 0 && <pre className="ad-msg" style={{ fontSize: ".75rem", whiteSpace: "pre-wrap" }}>{trail.join("\n")}</pre>}
        </div>
      </div>
    );
  }

  const cats = CATEGORIES.includes(f.category) ? CATEGORIES : [f.category, ...CATEGORIES];

  return (
    <div className="ad">
      <header className="ad-top">
        <h1>Yolique admin</h1>
        <div>
          <a href="#/">View store</a>
          <button onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <section className="ad-box">
        <h2>{editId ? "Edit product" : "Add product"}</h2>
        <label>Name *<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>Description (optional)
          <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <label>Category
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <p className="ad-lab">Type of piece</p>
        <div className="ad-chips">
          <button className={`ad-chip${f.thrifted ? " on" : ""}`} onClick={() => setF({ ...f, thrifted: true })}>Thrifted</button>
          <button className={`ad-chip${!f.thrifted ? " on" : ""}`} onClick={() => setF({ ...f, thrifted: false })}>Conventional</button>
        </div>
        <small className="ad-hint">
          {f.thrifted
            ? "Thrifted: one-of-one. Shoppers only see the size and colour below, they can't choose. Shows a Thrifted badge."
            : "Conventional: shoppers choose a size and colour from the ones you tick below. No badge."}
        </small>
        <label className="ad-check">
          <input type="checkbox" checked={f.isNew} onChange={(e) => setF({ ...f, isNew: e.target.checked })} /> Show "New" badge on this piece
        </label>
        <div className="ad-two">
          <label>Price (K) *<input type="number" inputMode="numeric" value={f.price}
            onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
          <label>Old price (K, optional)<input type="number" inputMode="numeric" value={f.original}
            onChange={(e) => setF({ ...f, original: e.target.value })} /></label>
        </div>

        <p className="ad-lab">{f.thrifted ? "Size of this piece" : "Sizes available"}</p>
        <div className="ad-chips">
          {SIZES.map((s) => (
            <button key={s} className={`ad-chip${f.sizes.includes(s) ? " on" : ""}`} aria-pressed={f.sizes.includes(s)} onClick={() => tog("sizes", s)}>{s}</button>
          ))}
        </div>
        <p className={`ad-picked${f.sizes.length ? " has" : ""}`}>
          {f.sizes.length ? `Selected: ${f.sizes.join(", ")}` : "No size selected yet"}
        </p>

        <p className="ad-lab">{f.thrifted ? "Colour of this piece" : "Colours available"}</p>
        <div className="ad-chips">
          {COLOR_LIST.map(({ name, code }) => (
            <button key={name} className={`ad-chip${f.colors.includes(name) ? " on" : ""}`} aria-pressed={f.colors.includes(name)} onClick={() => tog("colors", name)}>
              <i style={{ background: code }} />{name}
            </button>
          ))}
        </div>
        <p className={`ad-picked${f.colors.length ? " has" : ""}`}>
          {f.colors.length ? `Selected: ${f.colors.join(", ")}` : "No colour selected yet"}
        </p>

        <p className="ad-lab">Photos (first one is the cover)</p>
        <input type="file" accept="image/*" multiple onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        {f.imgs.length === 0 && <p className="ad-picked">No photos added yet</p>}
        <div className="ad-thumbs">
          {f.imgs.map((u, i) => (
            <div key={u} className="ad-thumb">
              {i === 0 && <span className="ad-cover">Cover</span>}
              <img src={u} alt="" />
              <div className="ad-thumb-acts">
                <button onClick={() => setF({ ...f, imgs: f.imgs.filter((x) => x !== u) })}>Remove</button>
                {i > 0 && <button onClick={() => setF({ ...f, imgs: [u, ...f.imgs.filter((x) => x !== u)] })}>Make cover</button>}
              </div>
            </div>
          ))}
        </div>

        <label className="ad-check">
          <input type="checkbox" checked={f.sold} onChange={(e) => setF({ ...f, sold: e.target.checked })} /> Mark as sold
        </label>
        <button className="ad-gold" disabled={busy} onClick={save}>{editId ? "Save changes" : "Add product"}</button>
        {editId && <button onClick={() => { setF(blank); setEditId(null); }}>Cancel edit</button>}
        {msg && <p className={`ad-msg ${tone(msg)}`}>{msg}</p>}
      </section>

      <section className="ad-list">
        <h2>All products ({rows.length})</h2>
        {rows.map((r) => (
          <div key={r.id} className={`ad-row${r.sold ? " sold" : ""}`}>
            {r.image_url ? <img src={r.image_url} alt="" /> : <span className="ad-ph" />}
            <div className="ad-info">
              <strong>{r.title}</strong>
              <small>K{Number(r.price_zmw).toLocaleString()} · {r.category}{r.thrifted ? " · Thrifted" : ""}{r.is_new ? " · New" : ""}{r.sold ? " · SOLD" : ""}</small>
            </div>
            <div className="ad-acts">
              <button onClick={() => edit(r)}>Edit</button>
              <button onClick={() => toggleSold(r)}>{r.sold ? "Relist" : "Sold"}</button>
              <button onClick={() => remove(r)}>Delete</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}