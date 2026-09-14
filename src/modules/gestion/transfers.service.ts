import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateTransferInput, TransferQuery } from './transfers.types.js'

const TRANSFER_INCLUDE = {
  product: { select: { id: true, name: true, sku: true } },
  fromStore: { select: { id: true, name: true } },
  toStore: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const

export async function listTransfers(query: TransferQuery) {
  return prisma.stockTransfer.findMany({
    where: {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.storeId
        ? { OR: [{ fromStoreId: query.storeId }, { toStoreId: query.storeId }] }
        : {}),
    },
    include: TRANSFER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: query.limit,
  })
}

/**
 * Déplace de la marchandise d'une boutique à une autre.
 *
 * Le total de l'entreprise ne bouge pas — `products.stock` est laissé tel quel :
 * un transfert ne fait pas entrer ni sortir de marchandise, il la range
 * ailleurs. Seule la répartition change, et deux mouvements d'inventaire
 * portant la même référence permettent de la relire.
 */
export async function createTransfer(input: CreateTransferInput, actorId: string) {
  const [product, from, to] = await Promise.all([
    prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true },
    }),
    prisma.store.findUnique({ where: { id: input.fromStoreId } }),
    prisma.store.findUnique({ where: { id: input.toStoreId } }),
  ])

  if (!product) throw new AppError('Produit introuvable', 404)
  if (!from) throw new AppError('Boutique de départ introuvable', 404)
  if (!to) throw new AppError('Boutique d’arrivée introuvable', 404)
  if (!to.isActive) throw new AppError(`« ${to.name} » est désactivée.`, 400)

  const source = await prisma.storeStock.findUnique({
    where: { productId_storeId: { productId: product.id, storeId: from.id } },
  })
  const available = source?.quantity ?? 0
  if (available < input.quantity) {
    throw new AppError(
      `« ${from.name} » n’a que ${available} × « ${product.name} » : impossible d’en transférer ${input.quantity}.`,
      409,
    )
  }

  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.create({
      data: { ...input, createdById: actorId },
      include: TRANSFER_INCLUDE,
    })

    await tx.storeStock.update({
      where: { productId_storeId: { productId: product.id, storeId: from.id } },
      data: { quantity: { decrement: input.quantity } },
    })
    await tx.storeStock.upsert({
      where: { productId_storeId: { productId: product.id, storeId: to.id } },
      create: { productId: product.id, storeId: to.id, quantity: input.quantity },
      update: { quantity: { increment: input.quantity } },
    })

    // Quantité négative au départ, positive à l'arrivée : même convention que
    // les ventes et les réceptions.
    await tx.inventory.createMany({
      data: [
        {
          productId: product.id,
          storeId: from.id,
          quantity: -input.quantity,
          type: 'TRANSFER',
          reference: transfer.id,
          note: `Transfert vers ${to.name}`,
        },
        {
          productId: product.id,
          storeId: to.id,
          quantity: input.quantity,
          type: 'TRANSFER',
          reference: transfer.id,
          note: `Transfert depuis ${from.name}`,
        },
      ],
    })

    return transfer
  })
}
