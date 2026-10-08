import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type OrderItem = {
  id: string;
  title: string;
  price_zmw: number;
  size?: string | null;
  color?: string | null;
};

export type OrderLine = { id: string; size?: string; color?: string };

export type OrderStatus = "new" | "confirmed" | "delivered" | "cancelled";

export type OrderRow = {
  id: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_area: string | null;
  note: string | null;
  items: OrderItem[];
  total_zmw: number;
  status: OrderStatus;
};

export type PlaceOrderResult =
  | { ok: true; orderId: string; ref: string; total: number }
  | { ok: false; error: string; soldIds: string[] };

/** Short code the customer can quote on WhatsApp, e.g. "A3F9K2". */
export const orderRef = (id: string) => id.slice(0, 6).toUpperCase();

/**
 * Saves the order and marks every piece as sold in one step.
 * Call this just BEFORE opening WhatsApp. If it fails because a piece was
 * just taken, remove `soldIds` from the bag and tell the customer.
 */
export async function placeOrder(
  lines: OrderLine[],
  details: { name?: string; phone?: string; area?: string; note?: string } = {},
): Promise<PlaceOrderResult> {
  if (!supabase) return { ok: false, error: "The shop is offline right now.", soldIds: [] };

  // untyped on purpose: the generated Database types do not know about place_order
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db.rpc("place_order", {
    p_lines: lines.map((l) => ({ id: l.id, size: l.size ?? "", color: l.color ?? "" })),
    p_name: details.name ?? null,
    p_phone: details.phone ?? null,
    p_area: details.area ?? null,
    p_note: details.note ?? null,
  });

  if (error) return { ok: false, error: error.message, soldIds: [] };

  if (data?.ok) {
    return { ok: true, orderId: data.order_id, ref: orderRef(data.order_id), total: Number(data.total) };
  }
  return { ok: false, error: data?.error ?? "Could not place the order.", soldIds: data?.sold_ids ?? [] };
}

/** True for pieces added in the last `days` days (for a "Just dropped" badge). */
export const isNewArrival = (createdAt: string | null | undefined, days = 7): boolean =>
  !!createdAt && Date.now() - new Date(createdAt).getTime() < days * 24 * 60 * 60 * 1000;