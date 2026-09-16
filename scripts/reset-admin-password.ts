// Resets the Super Admin's password from the terminal — for when you forget
// it. There's no "forgot password" flow in the UI on purpose (see
// scripts/create-admin.ts for why); this is the equivalent for recovery.
//
// Run with:  npm run reset-admin-password

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { askHidden } from "./terminalInput.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.adminUser.findFirst();
  if (!admin) {
    console.error(
      "\nNo admin account exists yet. Run:  npm run create-admin\n"
    );
    process.exit(1);
  }

  console.log(`\nResetting the password for Super Admin "${admin.userId}".\n`);

  let password = "";
  while (password.length < 6) {
    password = await askHidden("New password (min 6 chars, hidden): ");
    if (password.length < 6) console.log("  Too short — try again.");
  }

  let confirm = "";
  while (confirm !== password) {
    confirm = await askHidden("Confirm new password: ");
    if (confirm !== password) console.log("  Doesn't match — try again.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash },
  });

  // Force a fresh login everywhere — the old password (and any session it
  // was used to start) no longer works.
  await prisma.adminSession.deleteMany({ where: { adminId: admin.id } });

  console.log(`\n✅ Password updated for "${admin.userId}". Sign in at /login with the new password.\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
