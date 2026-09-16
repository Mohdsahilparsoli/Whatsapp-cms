// Creates the one and only Super Admin account. Terminal-only, on purpose —
// there is no "Add Admin" button anywhere in the app.
//
// Run with:  npm run create-admin
//
// Refuses to run if an admin already exists (use
// `npm run reset-admin-password` if you forgot the password instead of
// trying to create a second one).

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { ask, askHidden } from "./terminalInput.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const USER_ID_RE = /^[a-z0-9_]{4,}$/i;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

async function main() {
  const existingCount = await prisma.adminUser.count();
  if (existingCount > 0) {
    console.error(
      "\nAn admin account already exists. This app only ever has one Super Admin.\n" +
        "Forgot the password? Run:  npm run reset-admin-password\n"
    );
    process.exit(1);
  }

  console.log("\nSet up the Super Admin account (this only needs to be done once).\n");

  let userId = "";
  while (!USER_ID_RE.test(userId)) {
    userId = await ask("User ID (min 4 chars, letters/numbers/underscore): ");
    if (!USER_ID_RE.test(userId)) console.log("  Invalid — try again.");
  }

  let name = "";
  while (!name) {
    name = await ask("Your name: ");
  }

  let email = "";
  while (!EMAIL_RE.test(email)) {
    email = await ask("Email: ");
    if (!EMAIL_RE.test(email)) console.log("  Invalid email — try again.");
  }

  let password = "";
  while (password.length < 6) {
    password = await askHidden("Password (min 6 chars, hidden): ");
    if (password.length < 6) console.log("  Too short — try again.");
  }

  let confirm = "";
  while (confirm !== password) {
    confirm = await askHidden("Confirm password: ");
    if (confirm !== password) console.log("  Doesn't match — try again.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.adminUser.create({
    data: { userId, name, email, passwordHash },
  });

  console.log(
    `\n✅ Super Admin account created. Sign in at /login with User ID "${userId}" and the password you just set.\n`
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
