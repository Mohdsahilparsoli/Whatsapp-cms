// Seeds the database with demo clients so you can test real login right
// after migrating — without having to create a client by hand first.
//
// Run with:  npx prisma db seed
// (this also runs automatically after `npx prisma migrate dev` the first time)

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Every seeded client shares this password so it's easy to remember while
// testing. Change it (or reset it from the Clients page) before sharing this
// app with anyone real.
const DEFAULT_PASSWORD = "Demo@123";

const today = new Date();
function daysFromToday(days) {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d;
}

const clients = [
  {
    name: "Sharma Electronics",
    userId: "sharma_admin",
    email: "admin@sharmaelectronics.in",
    phone: "+91 98110 22331",
    startDate: daysFromToday(-246),
    expiryDate: daysFromToday(119),
    status: "active",
    messagesSent: 48210,
    contacts: 12840,
    plan: "Business",
  },
  {
    name: "Nova Fashion House",
    userId: "nova_admin",
    email: "it@novafashion.com",
    phone: "+91 90045 77120",
    startDate: daysFromToday(-363),
    expiryDate: daysFromToday(2),
    status: "active",
    messagesSent: 91340,
    contacts: 33900,
    plan: "Growth",
  },
  {
    name: "Green Leaf Organics",
    userId: "greenleaf",
    email: "hello@greenleaf.co.in",
    phone: "+91 77380 45512",
    startDate: daysFromToday(-359),
    expiryDate: daysFromToday(6),
    status: "active",
    messagesSent: 15870,
    contacts: 5410,
    plan: "Starter",
  },
  {
    name: "Apex Fitness Studio",
    userId: "apexfit",
    email: "owner@apexfitness.in",
    phone: "+91 96500 11290",
    startDate: daysFromToday(-457),
    expiryDate: daysFromToday(-92),
    status: "expired",
    messagesSent: 7620,
    contacts: 2280,
    plan: "Starter",
  },
  {
    name: "Bluewave Travels",
    userId: "bluewave",
    email: "support@bluewavetravels.com",
    phone: "+91 88220 66410",
    startDate: daysFromToday(-226),
    expiryDate: daysFromToday(139),
    status: "suspended",
    messagesSent: 2140,
    contacts: 1190,
    plan: "Growth",
  },
  {
    name: "Demo Client Account",
    userId: "clientdemo",
    email: "demo@whatsappcms.test",
    phone: "+91 90000 00000",
    startDate: daysFromToday(-4),
    expiryDate: daysFromToday(10),
    status: "active",
    messagesSent: 18420,
    contacts: 8642,
    plan: "Free Trial",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  for (const c of clients) {
    await prisma.client.upsert({
      where: { userId: c.userId },
      update: {},
      create: { ...c, passwordHash },
    });
  }

  console.log(`\nSeeded ${clients.length} clients. They can all log in with:\n`);
  for (const c of clients) {
    console.log(`  User ID: ${c.userId.padEnd(14)}  Password: ${DEFAULT_PASSWORD}`);
  }
  console.log(
    "\nChange these from the Clients page (Reset button) before using this app for anything real.\n"
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
