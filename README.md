# Yolique Boutique

Luxury boutique storefront built with Vite, React, TypeScript, Tailwind CSS, and Supabase. Product records are read directly from the Supabase `products` table; the app does not include product seed data or a fallback catalog.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project.
3. Ensure the `products` table exposes `id`, `created_at`, `title`, `price_zmw`, and optional `description`, `category`, and `image_url` columns, with read access enabled for the anon role.
4. Start the storefront with `npm run dev` or create a production build with `npm run build`.

Product orders and bag inquiries open WhatsApp at +260 964 687 209.