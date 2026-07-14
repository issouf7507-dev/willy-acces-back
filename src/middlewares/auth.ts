import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export interface AuthPayload {
  userId: string;
  role: string;
}


export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ success: false, error: "Token manquant ou invalide" });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { select: { id: true, role: true, isActive: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      res
        .status(401)
        .json({ success: false, error: "Session expirée ou invalide" });
      return;
    }

    if (!session.user.isActive) {
      res.status(403).json({ success: false, error: "Compte désactivé" });
      return;
    }

    req.user = { userId: payload.userId, role: payload.role };
    next();
  } catch {
    res.status(401).json({ success: false, error: "Token invalide" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Non authentifié" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: "Accès refusé" });
      return;
    }
    next();
  };
}
