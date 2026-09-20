import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: "owner@studio-os.dev" },
    update: {},
    create: {
      email: "owner@studio-os.dev",
      name: "Studio Owner",
      role: "OWNER",
    },
  });

  const clientCount = await prisma.client.count({ where: { ownerId: owner.id } });
  if (clientCount > 0) {
    console.log("Seed data already present, skipping.");
    return;
  }

  const [avery, jordan, morgan] = await Promise.all([
    prisma.client.create({
      data: {
        ownerId: owner.id,
        name: "Avery Chen",
        email: "avery@example.com",
        phone: "555-0101",
        source: "Instagram",
      },
    }),
    prisma.client.create({
      data: {
        ownerId: owner.id,
        name: "Jordan Blake",
        email: "jordan@example.com",
        phone: "555-0102",
        source: "Referral",
      },
    }),
    prisma.client.create({
      data: {
        ownerId: owner.id,
        name: "Morgan Reyes",
        email: "morgan@example.com",
        source: "Website inquiry",
      },
    }),
  ]);

  await Promise.all([
    prisma.booking.create({
      data: {
        ownerId: owner.id,
        clientId: avery.id,
        shootType: "Engagement",
        stage: "INQUIRY",
      },
    }),
    prisma.booking.create({
      data: {
        ownerId: owner.id,
        clientId: jordan.id,
        shootType: "Wedding",
        stage: "BOOKED",
        scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        durationMins: 480,
      },
    }),
    prisma.booking.create({
      data: {
        ownerId: owner.id,
        clientId: morgan.id,
        shootType: "Product",
        stage: "EDITING",
      },
    }),
  ]);

  console.log("Seeded owner, clients, and bookings.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
