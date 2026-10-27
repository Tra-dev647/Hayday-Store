import type { StoreItem } from "./types";

export async function fetchProducts(): Promise<StoreItem[] | null> {
  try {
    const r = await fetch("/api/products", { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.items) ? (j.items as StoreItem[]) : null;
  } catch {
    return null;
  }
}

export async function postAdmin(
  key: string,
  items?: StoreItem[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items === undefined ? { key } : { key, items }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true };
    return { ok: false, error: j.error || "មានបញ្ហា សូមព្យាយាមម្តងទៀត" };
  } catch {
    return { ok: false, error: "មិនអាចតភ្ជាប់ server បានទេ" };
  }
}

export async function uploadImage(
  key: string,
  image: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const r = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, image }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return { ok: true, url: j.url as string };
    return { ok: false, error: j.error || "upload រូបមិនបាន" };
  } catch {
    return { ok: false, error: "មិនអាចតភ្ជាប់ server បានទេ" };
  }
}
