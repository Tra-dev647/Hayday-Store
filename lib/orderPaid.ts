import { prisma } from "@/lib/prisma";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";

/**
 * Atomically flip a PENDING order to PAID and notify the operator on Telegram.
 * Returns true only for the call that actually changed the order, so the
 * notification is sent exactly once even if several polls race.
 */
export async function markOrderPaid(orderId: string): Promise<boolean> {
  const res = await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (res.count === 0) return false;

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: { game: true, product: true },
  });
  if (full) {
    const baseUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
    const link = baseUrl
      ? `\n<a href="${baseUrl}/admin/orders/${full.orderNumber}">Open in admin</a>`
      : "";
    await notifyTelegram(
      `💰 <b>New paid order (TraTopup)</b>\n` +
        `<b>#${escapeHtml(full.orderNumber)}</b>\n` +
        `${escapeHtml(full.game.name)} — ${escapeHtml(full.product.name)}\n` +
        `UID: <code>${escapeHtml(full.playerUid)}</code>` +
        (full.serverId ? ` (${escapeHtml(full.serverId)})` : "") +
        `\nAmount: $${full.amountUsd.toFixed(2)}` +
        (full.amountKhr ? ` · ${full.amountKhr.toLocaleString("en-US")} ៛` : "") +
        link
    );
  }
  return true;
}
