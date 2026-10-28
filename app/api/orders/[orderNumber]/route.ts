import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchPaymentStatus } from "@/lib/payment";
import { markOrderPaid } from "@/lib/orderPaid";

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderNumber: string } }
) {
  let order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber.toUpperCase() },
    include: {
      game: { select: { name: true, slug: true } },
      product: { select: { name: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Bakong has no webhook, so we check the KHQR payment while the customer is
  // watching the checkout page (the page polls this endpoint every few seconds).
  if (order.status === "PENDING" && order.paymentRef && !order.paymentRef.startsWith("SIM-")) {
    try {
      const remote = await fetchPaymentStatus(order.paymentRef, order.amountKhr ?? 0);
      if (remote?.paid) {
        await markOrderPaid(order.id);
      } else if (
        order.paymentExpiresAt &&
        Date.now() > order.paymentExpiresAt.getTime() + 90_000
      ) {
        // QR expired (+90s grace for payments made right at the deadline)
        await prisma.order.updateMany({
          where: { id: order.id, status: "PENDING" },
          data: { status: "CANCELLED", failureReason: "QR expired" },
        });
      }
      order = (await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          game: { select: { name: true, slug: true } },
          product: { select: { name: true } },
        },
      })) ?? order;
    } catch {
      // Ignore poll errors — we retry on the next request.
    }
  }

  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
    gameName: order.game.name,
    gameSlug: order.game.slug,
    productName: order.product.name,
    playerUid: order.playerUid,
    serverId: order.serverId,
    amountUsd: order.amountUsd,
    amountKhr: order.amountKhr,
    paymentMethod: order.paymentMethod,
    paymentRef: order.paymentRef,
    paymentUrl: order.paymentUrl,
    qrString: order.qrString,
    paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
  });
}
