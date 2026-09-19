import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type {
  CreateShipmentInput,
  CreateShipmentItemInput,
  ShipmentQuery,
  UpdateShipmentInput,
  UpdateShipmentItemInput,
} from './shipments.types.js'

const SHIPMENT_INCLUDE = {
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, stock: true } },
      store: { select: { id: true, name: true } },
      // Quantités déjà affectées à des livraisons, pour calculer le reçu et
      // le reste à livrer de chaque ligne.
      receipts: { select: { quantity: true, group: { select: { status: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  },
  groups: {
    select: {
      id: true,
      code: true,
      label: true,
      status: true,
      shippingCost: true,
      receivedAt: true,
      items: { select: { shipmentItemId: true, quantity: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  store: { select: { id: true, name: true } },
} satisfies Prisma.ShipmentInclude

export const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v)

/**
 * Prochain code libre d'une série : A1, A2… pour les arrivages, G1, G2… pour
 * les groupes. Le suivi Excel numérotait les lots à la main ; on garde la même
 * lisibilité sans le risque de doublon.
 */
export function nextCode(existing: { code: string }[], prefix: string): string {
  const max = existing.reduce((acc, { code }) => {
    const n = Number(code.slice(prefix.length))
    return code.startsWith(prefix) && Number.isInteger(n) && n > acc ? n : acc
  }, 0)
  return `${prefix}${max + 1}`
}

const nextShipmentCode = async () =>
  nextCode(await prisma.shipment.findMany({ where: { code: { startsWith: 'A' } }, select: { code: true } }), 'A')

export async function listShipments(query: ShipmentQuery) {
  return prisma.shipment.findMany({
    where: query.status ? { status: query.status } : {},
    include: SHIPMENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
}

export async function getShipment(id: string) {
  const shipment = await prisma.shipment.findUnique({ where: { id }, include: SHIPMENT_INCLUDE })
  if (!shipment) throw new AppError('Arrivage introuvable', 404)
  return shipment
}

/**
 * Un arrivage reste modifiable tant que la marchandise n'est pas toute
 * arrivée : en attente ou partiellement reçu.
 */
export async function getOpen(id: string) {
  const shipment = await getShipment(id)
  if (shipment.status === 'RECEIVED' || shipment.status === 'CANCELLED') {
    throw new AppError(
      `Cet arrivage est ${shipment.status === 'RECEIVED' ? 'complet' : 'annulé'} : il n’est plus modifiable.`,
      409,
    )
  }
  return shipment
}

export async function createShipment(input: CreateShipmentInput) {
  const code = input.code ?? (await nextShipmentCode())
  return prisma.shipment.create({
    data: {
      ...input,
      code,
      orderedAt: input.orderedAt ? new Date(input.orderedAt) : undefined,
    },
    include: SHIPMENT_INCLUDE,
  })
}

export async function updateShipment(id: string, input: UpdateShipmentInput) {
  await getOpen(id)
  return prisma.shipment.update({
    where: { id },
    data: { ...input, ...(input.orderedAt ? { orderedAt: new Date(input.orderedAt) } : {}) },
    include: SHIPMENT_INCLUDE,
  })
}

// ─── Lignes commandées ───────────────────────────────────────────────────────

/** Une boutique désactivée ne doit pas se retrouver créditée d'un arrivage. */
async function assertStore(storeId: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) throw new AppError('Boutique introuvable', 404)
  if (!store.isActive) throw new AppError(`« ${store.name} » est désactivée.`, 400)
  return store
}

export async function addItem(shipmentId: string, input: CreateShipmentItemInput) {
  const shipment = await getOpen(shipmentId)
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  })
  if (!product) throw new AppError('Produit introuvable', 404)

  // Sans boutique sur la ligne, celle du lot s'applique. Aucune des deux : on
  // refuse plutôt que de créditer un stock au hasard à la réception.
  const storeId = input.storeId ?? shipment.storeId
  if (!storeId) {
    throw new AppError(
      'Choisissez la boutique qui reçoit cet article, ou fixez celle de l’arrivage.',
      400,
    )
  }
  await assertStore(storeId)

  const existing = await prisma.shipmentItem.findUnique({
    where: { shipmentId_productId_storeId: { shipmentId, productId: input.productId, storeId } },
  })
  if (existing) {
    throw new AppError(
      'Ce produit est déjà dans l’arrivage pour cette boutique : modifiez sa ligne au lieu d’en ajouter une seconde.',
      409,
    )
  }

  await prisma.shipmentItem.create({ data: { ...input, storeId, shipmentId } })
  return getShipment(shipmentId)
}

export async function updateItem(
  shipmentId: string,
  itemId: string,
  input: UpdateShipmentItemInput,
) {
  await getOpen(shipmentId)
  const item = await prisma.shipmentItem.findFirst({
    where: { id: itemId, shipmentId },
    include: { receipts: { select: { quantity: true } } },
  })
  if (!item) throw new AppError('Ligne introuvable', 404)
  const allocated = item.receipts.reduce((sum, r) => sum + r.quantity, 0)

  // La commande ne peut pas descendre sous ce qui est déjà livré ou prévu
  // dans un groupe.
  if (input.quantity !== undefined && input.quantity < allocated) {
    throw new AppError(
      `${allocated} unité(s) de cette ligne sont déjà dans des groupes : la quantité commandée ne peut pas être inférieure.`,
      400,
    )
  }

  if (input.storeId && input.storeId !== item.storeId) {
    // Les livraisons ont crédité (ou créditeront) l'ancienne boutique.
    if (item.receipts.length) {
      throw new AppError('Cette ligne a déjà des livraisons : sa boutique ne peut plus changer.', 409)
    }
    await assertStore(input.storeId)
    const clash = await prisma.shipmentItem.findUnique({
      where: {
        shipmentId_productId_storeId: {
          shipmentId,
          productId: item.productId,
          storeId: input.storeId,
        },
      },
    })
    if (clash) {
      throw new AppError('Ce produit a déjà une ligne pour cette boutique dans l’arrivage.', 409)
    }
  }

  await prisma.shipmentItem.update({ where: { id: itemId }, data: input })
  return getShipment(shipmentId)
}

export async function removeItem(shipmentId: string, itemId: string) {
  await getOpen(shipmentId)
  const item = await prisma.shipmentItem.findFirst({
    where: { id: itemId, shipmentId },
    include: { _count: { select: { receipts: true } } },
  })
  if (!item) throw new AppError('Ligne introuvable', 404)
  if (item._count.receipts) {
    throw new AppError('Cette ligne figure dans un groupe : retirez-la du groupe d’abord.', 409)
  }

  await prisma.shipmentItem.delete({ where: { id: itemId } })
  return getShipment(shipmentId)
}

// ─── Cycle de vie ────────────────────────────────────────────────────────────

const hasReceivedGroup = (shipment: Awaited<ReturnType<typeof getShipment>>) =>
  shipment.groups.some((g) => g.status === 'RECEIVED')

/**
 * Recalcule l'état de l'arrivage d'après ses livraisons réceptionnées :
 * complet quand chaque ligne est entièrement reçue, partiel sinon.
 */
export async function refreshShipmentStatus(tx: Prisma.TransactionClient, shipmentId: string) {
  const items = await tx.shipmentItem.findMany({
    where: { shipmentId },
    select: {
      quantity: true,
      receipts: { where: { group: { status: 'RECEIVED' } }, select: { quantity: true } },
    },
  })
  const received = items.reduce(
    (sum, i) => sum + i.receipts.reduce((s, r) => s + r.quantity, 0),
    0,
  )
  const complete = items.every(
    (i) => i.receipts.reduce((s, r) => s + r.quantity, 0) >= i.quantity,
  )
  await tx.shipment.update({
    where: { id: shipmentId },
    data: {
      status: received === 0 ? 'DRAFT' : complete ? 'RECEIVED' : 'PARTIAL',
      receivedAt: received === 0 ? null : new Date(),
    },
  })
}

/**
 * Annule un arrivage dont rien n'est encore arrivé. Ses groupes en brouillon
 * disparaissent avec lui : ils ne pourront plus être réceptionnés.
 */
export async function cancelShipment(id: string) {
  const shipment = await getOpen(id)
  if (hasReceivedGroup(shipment)) {
    throw new AppError(
      'Une partie de cet arrivage est déjà reçue : clôturez-le plutôt que de l’annuler.',
      409,
    )
  }
  await prisma.$transaction([
    prisma.shipmentGroup.deleteMany({ where: { shipmentId: id } }),
    prisma.shipment.update({ where: { id }, data: { status: 'CANCELLED' } }),
  ])
  return getShipment(id)
}

/**
 * Clôture un arrivage partiellement reçu dont le reste ne viendra jamais
 * (perdu, annulé par le fournisseur…). Les groupes en brouillon sont
 * supprimés ; ce qui a été reçu reste acquis.
 */
export async function closeShipment(id: string) {
  const shipment = await getOpen(id)
  if (!hasReceivedGroup(shipment)) {
    throw new AppError('Rien n’a encore été reçu : annulez l’arrivage plutôt que de le clôturer.', 409)
  }
  await prisma.$transaction([
    prisma.shipmentGroup.deleteMany({ where: { shipmentId: id, status: 'DRAFT' } }),
    prisma.shipment.update({ where: { id }, data: { status: 'RECEIVED' } }),
  ])
  return getShipment(id)
}

export async function deleteShipment(id: string) {
  const shipment = await getShipment(id)
  if (hasReceivedGroup(shipment)) {
    throw new AppError(
      'Une partie de cet arrivage est déjà reçue : il porte l’historique du stock et des coûts, il ne se supprime pas.',
      409,
    )
  }
  await prisma.$transaction([
    prisma.shipmentGroup.deleteMany({ where: { shipmentId: id } }),
    prisma.shipment.delete({ where: { id } }),
  ])
}
