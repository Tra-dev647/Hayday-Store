declare const process: any;
declare const fetch: any;
// @ts-ignore
import { createHmac, timingSafeEqual } from "crypto";

export const config = { api: { bodyParser: false } };

function readRaw(req: any): Promise<string> {
  return new Promise((resolve) => {
    let d = "";
    req.setEncoding?.("utf8");
    req.on("data", (c: any) => (d += c));
    req.on("end", () => resolve(d));
    req.on("error", () => resolve(d));
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();
  const secret = process.env.KHPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(500).end();

  const raw: string = req.body
    ? typeof req.body === "string" ? req.body : JSON.stringify(req.body)
    : await readRaw(req);

  const sig = String(req.headers["x-webhook-signature"] || req.headers["x-khpay-signature"] || "");
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(sig.replace(/^sha256=/, "sha256="));
  const b = Buffer.from(expected);
  const bare = Buffer.from(expected.slice(7));
  const ok = (a.length === b.length && timingSafeEqual(a, b)) || (a.length === bare.length && timingSafeEqual(a, bare));
  if (!ok) return res.status(403).end();

  try {
    const evt = JSON.parse(raw);
    const data = evt?.data || evt;
    const meta = data?.metadata || {};
    if ((evt?.event || "payment.paid") === "payment.paid" && meta.app === "hayday1") {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const admin = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (token && admin) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: admin,
            text: `✅ បានបង់ប្រាក់\n${meta.set}\nGame ID: ${meta.game_id}\n$${data.amount}\n${data.transaction_id}`,
          }),
        });
      }
    }
  } catch (e) {}
  return res.status(200).send("OK");
}
