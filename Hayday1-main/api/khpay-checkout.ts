declare const process: any;
declare const fetch: any;

// ✏️ កែឈ្មោះ និងតម្លៃ (USD) របស់ Set នៅទីនេះ
const SETS = [
  { id: "set1", name: "Set 1", price: "1.00" },
  { id: "set2", name: "Set 2", price: "5.00" },
  { id: "set3", name: "Set 3", price: "10.00" },
];

export default async function handler(req: any, res: any) {
  if (req.method === "GET") return res.status(200).json({ sets: SETS });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const set = SETS.find((s) => s.id === body.setId);
    const gameId = String(body.gameId || "").trim();
    if (!set) return res.status(400).json({ error: "សូមរើស Set" });
    if (!/^[A-Za-z0-9_#\-]{3,30}$/.test(gameId)) {
      return res.status(400).json({ error: "Game ID មិនត្រឹមត្រូវ" });
    }
    const site = process.env.SITE_URL || `https://${req.headers.host}`;
    const headers: any = {
      Authorization: `Bearer ${process.env.KHPAY_API_KEY}`,
      "Content-Type": "application/json",
    };
    if (process.env.KHPAY_TEST === "1") headers["X-Test-Mode"] = "true";

    const r = await fetch("https://khpay.site/api/v1/qr/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: set.price,
        currency: "USD",
        note: `${set.name} | ID ${gameId}`,
        success_url: `${site}/intro.html`,
        cancel_url: `${site}/intro.html`,
        metadata: { app: "hayday1", set: set.name, game_id: gameId },
      }),
    });
    const j = await r.json();
    if (!j.success) return res.status(502).json({ error: j.error || "KHPay error" });
    return res.status(200).json({ payment_url: j.data.payment_url });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
}
