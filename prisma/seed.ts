import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("⚡ Seeding TraTopup database...");

  // --- Settings singleton ---
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      siteName: "TraTopup",
      exchangeRate: 4100,
      supportTelegram: "@Tradev14",
      supportEmail: "support@tratopup.com",
    },
  });

  // --- Admin user ---
  const adminEmail = process.env.ADMIN_EMAIL || "admin@tratopup.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMeNow123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: "Super Admin",
      role: "SUPERADMIN",
    },
  });
  console.log(`✅ Admin created: ${adminEmail} / ${adminPassword}`);

  // --- Games ---
  const games = [
    {
      slug: "mobile-legends",
      name: "Mobile Legends: Bang Bang",
      publisher: "Moonton",
      description: "Top up Diamonds instantly for Mobile Legends",
      imageUrl: "https://cdn.tratopup.com/games/mlbb.jpg",
      bannerUrl: "https://cdn.tratopup.com/banners/mlbb.jpg",
      currencyName: "Diamonds",
      uidLabel: "User ID (Zone ID)",
      uidExample: "12345678",
      featured: true,
      sortOrder: 1,
      products: [
        { name: "11 Diamonds", amount: 11, priceUsd: 0.25 },
        { name: "22 Diamonds", amount: 22, priceUsd: 0.50 },
        { name: "56 Diamonds", amount: 56, priceUsd: 1.10 },
        { name: "86 Diamonds", amount: 86, bonus: 0, priceUsd: 1.80, badge: "Hot" },
        { name: "172 Diamonds", amount: 172, bonus: 0, priceUsd: 3.50 },
        { name: "257 Diamonds", amount: 257, bonus: 0, priceUsd: 5.20 },
        { name: "344 Diamonds", amount: 344, bonus: 0, priceUsd: 6.90 },
        { name: "429 Diamonds", amount: 429, bonus: 0, priceUsd: 8.60 },
        { name: "514 Diamonds", amount: 514, bonus: 0, priceUsd: 10.30 },
        { name: "706 Diamonds", amount: 706, bonus: 0, priceUsd: 13.80, badge: "Best Value" },
        { name: "878 Diamonds", amount: 878, bonus: 0, priceUsd: 17.20 },
        { name: "1050 Diamonds", amount: 1050, bonus: 0, priceUsd: 20.60 },
        { name: "2195 Diamonds", amount: 2195, bonus: 0, priceUsd: 42.80 },
        { name: "3688 Diamonds", amount: 3688, bonus: 0, priceUsd: 72.00 },
        { name: "5532 Diamonds", amount: 5532, bonus: 0, priceUsd: 108.00 },
        { name: "9288 Diamonds", amount: 9288, bonus: 0, priceUsd: 180.00 }
      ],
    },
  ];

  for (const g of games) {
    const { products, ...gameData } = g;
    const game = await prisma.game.upsert({
      where: { slug: gameData.slug },
      update: gameData,
      create: gameData,
    });

    // Clear old products for this game and recreate to keep seed idempotent
    await prisma.product.deleteMany({ where: { gameId: game.id } });
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      await prisma.product.create({
        data: {
          ...p,
          gameId: game.id,
          sortOrder: i,
        },
      });
    }
    console.log(`✅ ${game.name} with ${products.length} products`);
  }

  // Keep the storefront focused on MLBB only, including on databases seeded previously.
  await prisma.game.updateMany({
    where: { slug: { not: "mobile-legends" } },
    data: { active: false },
  });

  console.log("\n🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
