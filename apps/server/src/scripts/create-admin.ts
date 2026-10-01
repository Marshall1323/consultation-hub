import "dotenv/config";
import { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { prisma } from "../lib/prisma.js";

const getArgument = (name: string) => {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument?.slice(name.length + 3).trim();
};

const askForMissingValues = async () => {
  const terminal = createInterface({ input: stdin, output: stdout });

  try {
    const email = getArgument("email") ?? process.env.ADMIN_EMAIL ?? await terminal.question("Email: ");
    const password =
      getArgument("password") ?? process.env.ADMIN_PASSWORD ?? await terminal.question("Password (min. 8 characters): ");
    const firstName =
      getArgument("first-name") ?? process.env.ADMIN_FIRST_NAME ?? await terminal.question("First name: ");
    const lastName =
      getArgument("last-name") ?? process.env.ADMIN_LAST_NAME ?? await terminal.question("Last name: ");

    return {
      email: email.trim().toLowerCase(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    };
  } finally {
    terminal.close();
  }
};

const main = async () => {
  const input = await askForMissingValues();

  if (!input.email.includes("@")) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Password must contain at least 8 characters");
  if (input.firstName.length < 2 || input.lastName.length < 2) {
    throw new Error("First and last names must contain at least 2 characters");
  }

  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });

  if (existingUser) {
    throw new Error("A user with this email already exists. Choose another email.");
  }

  const admin = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hash(input.password, 12),
      firstName: input.firstName,
      lastName: input.lastName,
      role: UserRole.ADMIN,
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  console.log(`Administrator created: ${admin.email} (${admin.id})`);
};

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
