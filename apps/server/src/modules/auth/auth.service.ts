import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";

const PASSWORD_ROUNDS = 12;

type RegisterInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

const createToken = (userId: string, role: string) => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 24) {
    throw new Error("JWT_SECRET повинен містити щонайменше 24 символи");
  }

  return jwt.sign({ role }, secret, {
    subject: userId,
    expiresIn: "7d",
  });
};

export const registerClient = async (input: RegisterInput) => {
  const email = input.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    return null;
  }

  const passwordHash = await hash(input.password, PASSWORD_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    },
    select: publicUserSelect,
  });

  return { user, token: createToken(user.id, user.role) };
};

export const loginUser = async (emailInput: string, password: string) => {
  const email = emailInput.toLowerCase();
  const userWithPassword = await prisma.user.findUnique({ where: { email } });

  if (!userWithPassword) {
    return null;
  }

  if (!userWithPassword.isActive) {
    return null;
  }

  const passwordMatches = await compare(password, userWithPassword.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userWithPassword.id },
    select: publicUserSelect,
  });

  return { user, token: createToken(user.id, user.role) };
};

export const getPublicUser = (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });
