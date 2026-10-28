import crypto from "crypto";

/**
 * Bakong KHQR (NBC Cambodia) — builds a dynamic KHQR payload in KHR and checks
 * payment status with the official Bakong API (check_transaction_by_md5).
 *
 * Required env: BAKONG_ACCOUNT_ID (e.g. name@aba), BAKONG_MERCHANT_NAME,
 * BAKONG_TOKEN. Optional: BAKONG_MERCHANT_CITY (default PHNOM PENH).
 */

function tlv(tag: string, value: string): string {
  return tag + String(Buffer.byteLength(value, "utf8")).padStart(2, "0") + value;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  const bytes = Buffer.from(payload, "utf8");
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface BakongQr {
  qr: string;
  md5: string;
  expiresAt: Date;
}

const QR_LIFETIME_MS = 15 * 60 * 1000;

export function buildKhqr(opts: { amountKhr: number; billNumber: string }): BakongQr {
  const accountId = (process.env.BAKONG_ACCOUNT_ID || "").trim();
  const merchantName = (process.env.BAKONG_MERCHANT_NAME || "").trim().slice(0, 25);
  const merchantCity = (process.env.BAKONG_MERCHANT_CITY || "PHNOM PENH").trim().slice(0, 15);
  if (!accountId || !merchantName) {
    throw new Error("BAKONG_ACCOUNT_ID and BAKONG_MERCHANT_NAME are not configured");
  }
  if (!Number.isInteger(opts.amountKhr) || opts.amountKhr < 1) {
    throw new Error(`Invalid KHR amount: ${opts.amountKhr}`);
  }

  const now = Date.now();
  const expiresAt = new Date(now + QR_LIFETIME_MS);

  let qr = "";
  qr += tlv("00", "01");
  qr += tlv("01", "12"); // dynamic QR (has an amount)
  qr += tlv("29", tlv("00", accountId));
  qr += tlv("52", "5999");
  qr += tlv("53", "116"); // KHR
  qr += tlv("54", String(opts.amountKhr));
  qr += tlv("58", "KH");
  qr += tlv("59", merchantName);
  qr += tlv("60", merchantCity);
  qr += tlv("62", tlv("01", opts.billNumber.slice(0, 25)));
  qr += tlv("99", tlv("00", String(now)) + tlv("01", String(expiresAt.getTime())));
  qr += "6304";
  qr += crc16(qr);

  const md5 = crypto.createHash("md5").update(qr, "utf8").digest("hex");
  return { qr, md5, expiresAt };
}

export interface BakongStatus {
  paid: boolean;
  status: "paid" | "pending";
  detail?: string;
}

/**
 * Ask Bakong whether the KHQR with this md5 has been paid.
 * Returns null when the check itself could not be completed (network/token).
 */
export async function fetchBakongStatus(
  md5: string,
  expectedKhr: number
): Promise<BakongStatus | null> {
  const token = (process.env.BAKONG_TOKEN || "").trim();
  if (!token) {
    console.warn("[bakong] BAKONG_TOKEN is not set");
    return null;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10000);
  try {
    const res = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ md5 }),
      cache: "no-store",
      signal: ac.signal,
    });
    const raw = await res.text();
    let json: any = {};
    try { json = JSON.parse(raw); } catch { /* not JSON (e.g. blocked by firewall) */ }

    const data = json?.data;
    const code = json?.responseCode;
    const currency = String(data?.currency ?? "").toUpperCase();
    const currencyOk = !currency || currency === "KHR" || currency === "116";
    const amountOk = data && Math.abs(Number(data.amount) - expectedKhr) < 0.5;
    const paid = res.ok && (code === 0 || code === "0") && !!data && currencyOk && !!amountOk;

    if (!paid) {
      const detail = `HTTP ${res.status} | code ${code ?? "-"} | ${String(json?.responseMessage || raw.slice(0, 100)).replace(/\s+/g, " ")} | amount ${data?.amount ?? "-"} | currency ${data?.currency ?? "-"}`;
      if (process.env.BAKONG_DEBUG === "1") console.log("[bakong] not paid:", detail);
      return { paid: false, status: "pending", detail };
    }
    return { paid: true, status: "paid" };
  } catch (err) {
    console.warn("[bakong] check failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
