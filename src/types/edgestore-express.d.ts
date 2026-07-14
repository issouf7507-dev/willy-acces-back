// Shim de types pour `@edgestore/server/adapters/express`.
// Voir edgestore-server.d.ts pour la raison. Typage souple de l'API utilisée.

import type { RequestHandler } from 'express'

export function createEdgeStoreExpressHandler(config: {
  router: unknown
}): RequestHandler
