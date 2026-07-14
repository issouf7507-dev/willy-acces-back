import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(req: Request, res: Response) {
  res
    .status(404)
    .json({
      success: false,
      error: `Route non trouvée : ${req.method} ${req.path}`,
    });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json({ success: false, error: err.message, code: err.code });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: "Données invalides",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const fields = (err.meta?.target as string[])?.join(", ") ?? "champ";
      res.status(409).json({ success: false, error: `${fields} déjà utilisé` });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ success: false, error: "Ressource introuvable" });
      return;
    }
  }

  console.error("[ERROR]", err);
  const message =
    process.env.NODE_ENV === "production"
      ? "Erreur interne du serveur"
      : String(err);
  res.status(500).json({ success: false, error: message });
}
