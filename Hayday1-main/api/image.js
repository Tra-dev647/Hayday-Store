import { DB_URL, sql, ensureTables } from "./_db.js";

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || "");
  if (!DB_URL || !/^[a-f0-9]{8,40}$/.test(id)) return res.status(404).end();
  try {
    await ensureTables();
    const rows = await sql("SELECT mime, data FROM imgs WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).end();
    res.setHeader("Content-Type", rows[0].mime || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(Buffer.from(rows[0].data, "base64"));
  } catch {
    return res.status(500).end();
  }
}
