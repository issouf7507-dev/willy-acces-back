import type { AuthPayload } from "../middlewares/auth.ts";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
