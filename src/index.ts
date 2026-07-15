import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { notFound, errorHandler } from "./middlewares/errors.js";
import { apiLimiter } from "./middlewares/rateLimit.js";
import { edgeStoreHandler } from "./lib/edgestore.js";

import authRouter from "./modules/auth/auth.router.js";
import usersRouter from "./modules/users/users.router.js";
import productsRouter from "./modules/products/products.router.js";
import categoriesRouter from "./modules/categories/categories.router.js";
import ordersRouter from "./modules/orders/orders.router.js";
import cartRouter from "./modules/cart/cart.router.js";
import reviewsRouter from "./modules/reviews/reviews.router.js";
import couponsRouter from "./modules/coupons/coupons.router.js";
import inventoryRouter from "./modules/inventory/inventory.router.js";
import settingsRouter from "./modules/settings/settings.router.js";
import contentRouter from "./modules/content/content.router.js";
import quotesRouter from "./modules/quotes/quotes.router.js";

const app = express();

// Derrière le reverse-proxy (Nginx) : fait confiance au 1er proxy pour
// récupérer la vraie IP client (req.ip) — nécessaire au rate-limiting et
// à l'enregistrement des sessions.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true,
  }),
);
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/edgestore", edgeStoreHandler);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: { status: "ok", env: env.NODE_ENV, store: env.STORE_NAME },
  });
});

app.use("/api", apiLimiter);

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/products", productsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/cart", cartRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/coupons", couponsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/content", contentRouter);
app.use("/api/quotes", quotesRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(
    `[${env.STORE_NAME}] Server running on http://localhost:${env.PORT}`,
  );
});

export default app;
