import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { MONGODB_URI, ADMIN_USERNAME, ADMIN_NAME, ADMIN_PASSWORD } = process.env;

if (!MONGODB_URI || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error(
    "Set MONGODB_URI, ADMIN_USERNAME and ADMIN_PASSWORD before seeding the admin.",
  );
}
if (ADMIN_PASSWORD.length < 12) {
  throw new Error("ADMIN_PASSWORD must be at least 12 characters long.");
}

const username = ADMIN_USERNAME.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,80}$/.test(username)) {
  throw new Error("ADMIN_USERNAME must be 3-80 characters (letters, digits, dot, _ or -).");
}

try {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const users = mongoose.connection.collection("users");
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await users.updateOne(
    { username },
    {
      $set: {
        fullName: ADMIN_NAME?.trim() || "Administrator",
        passwordHash,
        isActive: true,
        updatedAt: new Date(),
      },
      $setOnInsert: { username, createdAt: new Date() },
    },
    { upsert: true },
  );
  console.log(`Admin account "${username}" is ready.`);
} finally {
  await mongoose.disconnect();
}
