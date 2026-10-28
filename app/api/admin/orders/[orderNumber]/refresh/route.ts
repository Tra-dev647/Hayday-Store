import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { fetchPaymentStatus } from "@/lib/payment";
import { markOrderPaid } from "@/lib/orderPaid";
import { NextRequest, NextResponse } from "next/server";

/**
 * Admin endpoint: asks Bakong whether the order's KHQR was paid and, if so,
 * flips the order to PAID (and sends the Telegram notification).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { orderNumber: string } }
) {
  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!order.paymentRef || order.paymentRef.startsWith("SIM-")) {
    return NextResponse.json({ error: "No Bakong reference on order" }, { status: 400 });
  }

  const remote = await fetchPaymentStatus(order.paymentRef, order.amountKhr ?? 0);

  let updated = false;
  if (remote?.paid && order.status === "PENDING") {
    updated = await markOrderPaid(order.id);
    await writeAudit({
      action: "order.bakong_refresh.auto_paid",
      targetType: "order",
      targetId: order.id,
      details: { paymentRef: order.paymentRef, remote },
    });
  }

  await writeAudit({
    action: "order.bakong_refresh",
    targetType: "order",
    targetId: order.id,
    details: { paymentRef: order.paymentRef, remote },
  });

  const fresh = await prisma.order.findUnique({ where: { id: order.id } });
  return NextResponse.json({ remote, updated, order: fresh });
}
