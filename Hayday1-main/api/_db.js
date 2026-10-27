// Shared Neon helper (files starting with "_" are not exposed as routes)
export const DB_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.STORAGE_DATABASE_URL ||
  process.env.STORAGE_POSTGRES_URL ||
  process.env.STORAGE_URL;

export async function sql(query, params = []) {
  const host = new URL(DB_URL).hostname;
  const r = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Neon-Connection-String": DB_URL },
    body: JSON.stringify({ query, params }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "db error");
  return j.rows || [];
}

export async function ensureTables() {
  await sql("CREATE TABLE IF NOT EXISTS kv (k text PRIMARY KEY, v text)");
  await sql("CREATE TABLE IF NOT EXISTS imgs (id text PRIMARY KEY, mime text, data text)");
}
