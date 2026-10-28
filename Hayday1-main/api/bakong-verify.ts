declare const process: any;
declare const fetch: any;
import { sql, DB_URL, ensureTables } from "./_db.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const md5 = String(body.md5 || "").trim();
    const billNumber = String(body.billNumber || "").trim();
    const buyerId = String(body.buyerId || "").trim();
    const expectedAmount = Number(body.amount);
    if (!/^[a-fA-F0-9]{32}$/.test(md5) || !/^HD[A-Z0-9]+$/.test(billNumber) || !buyerId || !Number.isSafeInteger(expectedAmount) || expectedAmount < 1) {
      return res.status(400).json({ error: "ព័ត៌មានបញ្ជាទិញមិនត្រឹមត្រូវ" });
    }
    if (!DB_URL) return res.status(503).json({ error: "Admin ត្រូវកំណត់ DATABASE_URL ក្នុង Vercel ជាមុនសិន" });
    await ensureTables();
    const orderRows = await sql("SELECT v FROM kv WHERE k = $1", [`bakong_order_${billNumber}`]);
    const order = orderRows[0]?.v ? JSON.parse(orderRows[0].v) : null;
    if (!order || order.md5 !== md5 || Number(order.amount) !== expectedAmount || String(order.buyerId) !== buyerId) {
      return res.status(403).json({ error: "ការបញ្ជាទិញមិនត្រូវគ្នា ឬមិនមានក្នុងប្រព័ន្ធ" });
    }
    const token = String(process.env.BAKONG_TOKEN || "").trim();
    if (!token) return res.status(503).json({ error: "Admin ត្រូវកំណត់ BAKONG_TOKEN ក្នុង Vercel Environment Variables ជាមុនសិន" });

    // Check the exact KHQR hash with the official Bakong API.
    const r = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ md5 }),
    });
    const result = await r.json().catch(() => ({}));
    const data = result?.data;
    const verified = r.ok && (result?.responseCode === 0 || result?.responseCode === "0") && data &&
      (!data.currency || String(data.currency) === "116") &&
      Number(data.amount) === expectedAmount;
    if (!verified) return res.status(200).json({ paid: false, message: "មិនទាន់រកឃើញការបង់ប្រាក់ដែលបានផ្ទៀងផ្ទាត់ទេ" });

    // Claim this bill first so the Telegram message is sent only once.
    const key = `bakong_paid_${billNumber}`;
    const claim = await sql("INSERT INTO kv (k, v) VALUES ($1, $2) ON CONFLICT (k) DO NOTHING RETURNING k", [key, "sent"]);
    if (!claim.length) return res.status(200).json({ paid: true, alreadyProcessed: true });

    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const channelId = String(process.env.TELEGRAM_CHAT_ID || "-1004442443281").trim();
    if (!botToken) {
      await sql("DELETE FROM kv WHERE k = $1", [key]);
      return res.status(503).json({ error: "Admin ត្រូវកំណត់ TELEGRAM_BOT_TOKEN ជាមុនសិន" });
    }
    const text = [
      "✅ បង់ប្រាក់ជោគជ័យ (Bakong KHQR)",
      `🧾 លេខបញ្ជាទិញ: ${billNumber}`,
      `🛒 ទំនិញ: ${order.itemName || order.itemId} · ${order.qty} set`,
      `💰 ចំនួនទឹកប្រាក់: ${expectedAmount.toLocaleString("en-US")} ៛`,
      `👤 ID អ្នកទិញ: ${buyerId}`,
    ].join("\n");
    const sendResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, text }),
    });
    const sent = await sendResponse.json().catch(() => ({}));
    if (!sent?.ok) {
      await sql("DELETE FROM kv WHERE k = $1", [key]);
      return res.status(502).json({ error: "បានពិនិត្យការបង់ប្រាក់ ប៉ុន្តែមិនអាចផ្ញើសារទៅ Telegram បានទេ។ ពិនិត្យ TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID និងថា Bot ជា Admin ក្នុង Channel។" });
    }
    return res.status(200).json({ paid: true });
  } catch (e) {
    return res.status(500).json({ error: "មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់ការបង់ប្រាក់" });
  }
}
