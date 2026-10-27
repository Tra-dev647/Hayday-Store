declare const process: any;
declare const fetch: any;

export default async function handler(req: any, res: any) {
  const txn = String(req.query?.txn || "");
  if (!/^txn_[A-Za-z0-9_]+$/.test(txn)) return res.status(400).json({ error: "bad txn" });
  try {
    const h = { Authorization: `Bearer ${process.env.KHPAY_API_KEY}` };
    const c = await (await fetch(`https://khpay.site/api/v1/qr/check/${txn}`, { headers: h })).json();
    const d = c?.data;
    if (!c?.success || !(d?.paid === true || d?.status === "paid")) {
      return res.status(200).json({ paid: false });
    }
    const t = await (await fetch(`https://khpay.site/api/v1/transactions/${txn}`, { headers: h })).json();
    const meta = t?.data?.metadata || {};
    if (meta.app !== "hayday1") return res.status(403).json({ error: "not ours" });

    // Telegram link: ប្រើ bot បង្កើត link ប្រើបានម្តង បើមិនមាន bot ប្រើ link ថេរ
    let link = process.env.TELEGRAM_INVITE_LINK || "";
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/createChatInviteLink`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID || "-1004363876871",
            member_limit: 1,
            expire_date: Math.floor(Date.now() / 1000) + 3600,
            name: String(meta.game_id || "buyer").slice(0, 32),
          }),
        });
        const j = await r.json();
        if (j?.ok && j.result?.invite_link) link = j.result.invite_link;
      } catch (e) {}
    }
    return res.status(200).json({ paid: true, set: meta.set, game_id: meta.game_id, telegram: link });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
}
