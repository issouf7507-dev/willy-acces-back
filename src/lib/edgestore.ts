import { initEdgeStore } from "@edgestore/server";
import { createEdgeStoreExpressHandler } from "@edgestore/server/adapters/express";

const es = initEdgeStore.create();

export const edgeStoreRouter = es.router({
  publicImages: es.imageBucket({
    maxSize: 1024 * 1024 * 10, // 10 MB
    accept: ["image/*"],
  }),
});

export type EdgeStoreRouter = typeof edgeStoreRouter;

export const edgeStoreHandler = createEdgeStoreExpressHandler({
  router: edgeStoreRouter,
});
