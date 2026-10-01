import { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";

type TokenPayload = {
  role: UserRole;
};

export type AuthenticatedRequest = Request & {
  auth: {
    userId: string;
    role: UserRole;
  };
};

export const requireRole = (...allowedRoles: UserRole[]) => (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const authenticatedRequest = request as AuthenticatedRequest;

  if (!authenticatedRequest.auth || !allowedRoles.includes(authenticatedRequest.auth.role)) {
    response.status(403).json({
      code: "ACCESS_FORBIDDEN",
      message: "Недостатньо прав для виконання цієї дії",
    });
    return;
  }

  next();
};

export const requireAuth = async (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    response.status(401).json({ code: "AUTH_REQUIRED", message: "Потрібна авторизація" });
    return;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    next(new Error("JWT_SECRET не налаштований"));
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as TokenPayload & jwt.JwtPayload;

    if (!payload.sub || !payload.role) {
      response.status(401).json({ code: "AUTH_TOKEN_INVALID", message: "Недійсний токен" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    });

    if (!user?.isActive) {
      response.status(401).json({ code: "AUTH_USER_INACTIVE", message: "Обліковий запис недоступний" });
      return;
    }

    (request as AuthenticatedRequest).auth = { userId: user.id, role: user.role };
    next();
  } catch {
    response.status(401).json({ code: "AUTH_TOKEN_INVALID", message: "Недійсний або прострочений токен" });
  }
};
