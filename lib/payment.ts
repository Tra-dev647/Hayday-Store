import crypto from "crypto";
import { buildKhqr, fetchBakongStatus } from "./bakong";

// Payments are made with Bakong KHQR — one QR that works in ABA, ACLEDA, Wing,
// TrueMoney, etc. MANUAL is kept as an admin override method.
export type PaymentMethod = "BAKONG" | "MANUAL";

export interface InitiatePaymentArgs {
  orderNumber: string;
  amountUsd: number;
  amountKhr: number;
  method: PaymentMethod;
}

export interface PaymentInitResult {
  paymentRef: string;
  redirectUrl: string;
  qrString?: string;
  expiresAt: Date;
}

const SIM_MODE = process.env.PAYMENT_SIMULATION_MODE === "true";

export async function initiatePayment(
  args: InitiatePaymentArgs
): Promise<PaymentInitResult> {
  if (SIM_MODE) return simulatePayment(args);
  if (args.method === "BAKONG") return initiateBakong(args);
  throw new Error(`Unsupported payment method: ${args.method}`);
}

function simulatePayment(args: InitiatePaymentArgs): PaymentInitResult {
  const ref = `SIM-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  const envBase = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const base = /^https?:\/\//i.test(envBase) ? envBase : "";
  return {
    paymentRef: ref,
    redirectUrl: `${base}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=${args.method}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  };
}

function initiateBakong(args: InitiatePaymentArgs): PaymentInitResult {
  const { qr, md5, expiresAt } = buildKhqr({
    amountKhr: args.amountKhr,
    billNumber: args.orderNumber,
  });
  return {
    paymentRef: md5, // Bakong tracks a KHQR by the md5 of its payload
    redirectUrl: `/checkout/${args.orderNumber}`,
    qrString: qr,
    expiresAt,
  };
}

/** Poll Bakong for a KHQR payment. paymentRef is the md5 saved at order creation. */
export async function fetchPaymentStatus(
  paymentRef: string,
  amountKhr: number
): Promise<{ status: string; paid: boolean } | null> {
  if (SIM_MODE || paymentRef.startsWith("SIM-")) return null;
  return fetchBakongStatus(paymentRef, amountKhr);
}
