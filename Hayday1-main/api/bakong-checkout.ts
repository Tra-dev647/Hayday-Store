declare const process: any;
import { createHash } from "crypto";
import defaultProducts from "../src/products.json" with { type: "json" };
import { DB_URL, sql, ensureTables } from "./_db.js";

function tlv(tag: string, value: string): string {
  return tag + String(Buffer.byteLength(value, "utf8")).padStart(2, "0") + value;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  const bytes = Buffer.from(payload, "utf8");
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const accountId = String(process.env.BAKONG_ACCOUNT_ID || "").trim();
    const merchantName = String(process.env.BAKONG_MERCHANT_NAME || "").trim().slice(0, 25);
    const merchantCity = String(process.env.BAKONG_MERCHANT_CITY || "PHNOM PENH").trim().slice(0, 15);
    if (!accountId || !merchantName) {
      return res.status(503).json({ error: "Admin ត្រូវកំណត់ BAKONG_ACCOUNT_ID និង BAKONG_MERCHANT_NAME ក្នុង Environment Variables ជាមុនសិន" });
    }
    const qty = Number(body.qty);
    const itemId = Number(body.itemId);
    const buyerId = String(body.buyerId || "").trim().slice(0, 80);
    if (!Number.isInteger(itemId) || !Number.isInteger(qty) || qty < 1 || qty > 7 || !buyerId) {
      return res.status(400).json({ error: "ព័ត៌មានបញ្ជាទិញមិនត្រឹមត្រូវ" });
    }
    let items: any = defaultProducts;
    if (DB_URL) {
      try {
        await ensureTables();
        const rows = await sql("SELECT v FROM kv WHERE k = $1", ["hayday_products"]);
        if (rows[0]?.v) items = JSON.parse(rows[0].v);
      } catch {
        return res.status(503).json({ error: "មិនអាចផ្ទៀងផ្ទាត់តម្លៃទំនិញបានទេ សូមព្យាយាមម្តងទៀត" });
      }
    }
    const item = Array.isArray(items) ? items.find((x: any) => Number(x.id) === itemId) : null;
    const set = item?.sets?.find((x: any) => Number(x.qty) === qty);
    const amount = Number(body.amount);
    const allowedAmounts = set ? [Number(set.price), ...(set.priceMax !== undefined ? [Number(set.priceMax)] : [])] : [];
    if (!item || !set || !Number.isSafeInteger(amount) || !allowedAmounts.includes(amount) || amount < 1 || amount > 999999999) {
      return res.status(400).json({ error: "តម្លៃ ឬ set មិនត្រឹមត្រូវ សូម refresh ទំព័រ" });
    }
    const itemName = String(item.name || "Hayday item").trim().slice(0, 50);

    const billNumber = `HD${Date.now().toString(36).toUpperCase()}`.slice(0, 25);
    const merchantAccount = tlv("00", "A000000677010111") + tlv("01", accountId);
    const additional = tlv("01", billNumber) + tlv("02", buyerId.slice(0, 25));
    let qr = "";
    qr += tlv("00", "01");
    qr += tlv("01", "12");
    qr += tlv("29", merchantAccount);
    qr += tlv("52", "5999");
    qr += tlv("53", "116"); // KHR
    qr += tlv("54", String(amount));
    qr += tlv("58", "KH");
    qr += tlv("59", merchantName);
    qr += tlv("60", merchantCity);
    qr += tlv("62", additional);
    qr += "6304";
    qr += crc16(qr);
    const md5 = createHash("md5").update(qr, "utf8").digest("hex");
    if (!DB_URL) return res.status(503).json({ error: "Admin ត្រូវកំណត់ DATABASE_URL ក្នុង Vercel ដើម្បីរក្សាទុក និងផ្ទៀងផ្ទាត់ការបញ្ជាទិញ" });
    await ensureTables();
    await sql("INSERT INTO kv (k, v) VALUES ($1, $2)", [`bakong_order_${billNumber}`, JSON.stringify({ md5, amount, buyerId, itemId, qty, createdAt: Date.now() })]);
    return res.status(200).json({ qr, md5, amount, billNumber, itemName, qty });
  } catch (error: any) {
    // Keep the detailed cause in Vercel Function Logs; do not expose secrets to the browser.
    console.error("[bakong-checkout] Failed to create KHQR:", error?.stack || error?.message || error);
    return res.status(500).json({ error: "Server error while generating KHQR. Check Vercel Function Logs." });
  }
}
