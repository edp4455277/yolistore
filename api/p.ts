// Vercel serverless function: serves a preview page for a shared product link.
// WhatsApp, Instagram, TikTok etc. read the title/image tags below; real visitors
// are sent on to the shop with the product already open.
//
// Link people share:  https://yoliqueboutique.app/p/<product id>
// (vercel.json rewrites that to this function)

// Vercel provides this at runtime; declared here so no extra type package is needed.
declare const process: { env: Record<string, string | undefined> };

type Req = { query: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined> };
type Res = { status(code: number): Res; setHeader(name: string, value: string): void; send(body: string): void };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async function handler(req: Req, res: Res) {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "yoliqueboutique.app");
  const site = `https://${host}`;

  const home = () => {
    res.status(302).setHeader("Location", site + "/");
    res.send("");
  };

  if (!id || !UUID.test(id)) return home();

  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return home();

  try {
    const r = await fetch(
      `${base}/rest/v1/products?id=eq.${id}&select=title,description,price_zmw,image_url,images,sold&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const rows = (await r.json()) as Array<{
      title: string; description: string | null; price_zmw: number;
      image_url: string | null; images: string | null; sold: boolean;
    }>;
    const p = rows?.[0];
    if (!p) return home();

    const image = p.image_url ?? p.images?.split(",")[0]?.trim() ?? "";
    const price = `K${Number(p.price_zmw).toLocaleString("en-US")}`;
    const title = `${p.title} - ${price} | Yolique Boutique`;
    const desc = p.sold
      ? "This piece has found a home. See what else is new at Yolique Boutique."
      : (p.description?.trim() || "Hand-picked thrift fashion. Order in seconds on WhatsApp.").slice(0, 180);
    const target = `${site}/#/p/${id}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Yolique Boutique">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(site + "/p/" + id)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body>
<script>location.replace(${JSON.stringify(target)});</script>
<p><a href="${esc(target)}">Open ${esc(p.title)}</a></p>
</body></html>`);
  } catch {
    return home();
  }
}
