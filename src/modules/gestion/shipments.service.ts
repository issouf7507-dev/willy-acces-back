import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type {
  CreateShipmentGroupInput,
  CreateShipmentInput,
  CreateShipmentItemInput,
  ShipmentQuery,
  UpdateShipmentGroupInput,
  UpdateShipmentInput,
  UpdateShipmentItemInput,
} from './shipments.types.js'

const SHIPMENT_INCLUDE = {
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, stock: true } },
      store: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  groups: { orderBy: { createdAt: 'asc' } },
  store: { select: { id: true, name: true } },
} satisfies Prisma.ShipmentInclude

const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v)

/**
 * Prochain code libre d'une série : A1, A2… pour les arrivages, G1, G2… pour
 * les groupes. Le suivi Excel numérotait les lots à la main ; on garde la même
 * lisibilité sans le risque de doublon.
 */
function nextCode(existing: { code: string }[], prefix: string): string {
  const max = existing.reduce((acc, { code }) => {
    const n = Number(code.slice(prefix.length))
    return code.startsWith(prefix) && Number.isInteger(n) && n > acc ? n : acc
  }, 0)
  return `${prefix}${max + 1}`
}

const nextShipmentCode = async () =>
  nextCode(await prisma.shipment.findMany({ where: { code: { startsWith: 'A' } }, select: { code: true } }), 'A')

const nextGroupCode = async () =>
  nextCode(await prisma.shipmentGroup.findMany({ where: { code: { startsWith: 'G' } }, select: { code: true } }), 'G')

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

/** Un arrivage réceptionné est figé : il a déjà bougé le stock et les coûts. */
async function getDraft(id: string) {
  const shipment = await getShipment(id)
  if (shipment.status !== 'DRAFT') {
    throw new AppError(
      `Cet arrivage est ${shipment.status === 'RECEIVED' ? 'déjà réceptionné' : 'annulé'} : il n’est plus modifiable.`,
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
  await getDraft(id)
  return prisma.shipment.update({
    where: { id },
    data: { ...input, ...(input.orderedAt ? { orderedAt: new Date(input.orderedAt) } : {}) },
    include: SHIPMENT_INCLUDE,
  })
}

export async function addItem(shipmentId: string, input: CreateShipmentItemInput) {
  const shipment = await getDraft(shipmentId)
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

// ─── Groupes ─────────────────────────────────────────────────────────────────

/** Vérifie que les lignes appartiennent bien à l'arrivage. */
async function assertItems(shipmentId: string, itemIds: string[]) {
  if (!itemIds.length) return
  const count = await prisma.shipmentItem.count({ where: { id: { in: itemIds }, shipmentId } })
  if (count !== new Set(itemIds).size) {
    throw new AppError('Certaines lignes n’appartiennent pas à cet arrivage.', 400)
  }
}

async function assertGroup(shipmentId: string, groupId: string) {
  const group = await prisma.shipmentGroup.findFirst({ where: { id: groupId, shipmentId } })
  if (!group) throw new AppError('Groupe introuvable', 404)
  return group
}

async function assertGroupCodeFree(code: string, exceptId?: string) {
  const clash = await prisma.shipmentGroup.findUnique({ where: { code } })
  if (clash && clash.id !== exceptId) {
    throw new AppError(`Le code ${code} est déjà pris par un autre groupe.`, 409)
  }
}

/**
 * Crée un groupe à partir de produits de l'arrivage. Une ligne déjà dans un
 * autre groupe y est déplacée : un article ne voyage que dans un seul groupe.
 */
export async function createGroup(shipmentId: string, input: CreateShipmentGroupInput) {
  await getDraft(shipmentId)
  const { itemIds, ...data } = input
  await assertItems(shipmentId, itemIds)
  const code = data.code ?? (await nextGroupCode())
  await assertGroupCodeFree(code)

  await prisma.$transaction(async (tx) => {
    const group = await tx.shipmentGroup.create({ data: { ...data, code, shipmentId } })
    if (itemIds.length) {
      await tx.shipmentItem.updateMany({
        where: { id: { in: itemIds }, shipmentId },
        data: { groupId: group.id },
      })
    }
  })
  return getShipment(shipmentId)
}

export async function updateGroup(
  shipmentId: string,
  groupId: string,
  input: UpdateShipmentGroupInput,
) {
  await getDraft(shipmentId)
  await assertGroup(shipmentId, groupId)
  if (input.code) await assertGroupCodeFree(input.code, groupId)
  await prisma.shipmentGroup.update({ where: { id: groupId }, data: input })
  return getShipment(shipmentId)
}

/** Supprime le groupe ; ses produits restent dans l'arrivage, sans groupe. */
export async function removeGroup(shipmentId: string, groupId: string) {
  await getDraft(shipmentId)
  await assertGroup(shipmentId, groupId)
  await prisma.shipmentGroup.delete({ where: { id: groupId } })
  return getShipment(shipmentId)
}

// ─── Lignes ──────────────────────────────────────────────────────────────────

/** Une boutique désactivée ne doit pas se retrouver créditée d'un arrivage. */
async function assertStore(storeId: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) throw new AppError('Boutique introuvable', 404)
  if (!store.isActive) throw new AppError(`« ${store.name} » est désactivée.`, 400)
  return store
}

export async function updateItem(
  shipmentId: string,
  itemId: string,
  input: UpdateShipmentItemInput,
) {
  await getDraft(shipmentId)
  const item = await prisma.shipmentItem.findFirst({ where: { id: itemId, shipmentId } })
  if (!item) throw new AppError('Ligne introuvable', 404)

  if (input.groupId) await assertGroup(shipmentId, input.groupId)

  if (input.storeId && input.storeId !== item.storeId) {
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
  await getDraft(shipmentId)
  const item = await prisma.shipmentItem.findFirst({ where: { id: itemId, shipmentId } })
  if (!item) throw new AppError('Ligne introuvable', 404)

  await prisma.shipmentItem.delete({ where: { id: itemId } })
  return getShipment(shipmentId)
}

/**
 * Coût de revient moyen d'un produit, pondéré par les quantités de tous les
 * arrivages réceptionnés.
 *
 * C'est ce chiffre qui corrige l'erreur du fichier Excel, dont la marge se
 * basait sur le seul prix d'achat et ignorait le transport — elle était donc
 * systématiquement surévaluée.
 */
async function recomputeCostPrice(tx: Prisma.TransactionClient, productId: string) {
  const items = await tx.shipmentItem.findMany({
    where: { productId, shipment: { status: 'RECEIVED' } },
    select: { quantity: true, landedCost: true },
  })

  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)
  if (totalQty === 0) return

  const totalCost = items.reduce((sum, i) => sum + num(i.landedCost) * i.quantity, 0)
  await tx.product.update({
    where: { id: productId },
    data: { costPrice: new Prisma.Decimal((totalCost / totalQty).toFixed(2)) },
  })
}

/**
 * Réceptionne un arrivage. C'est l'unique moment où il touche au stock :
 *
 *  1. le transport de chaque groupe est réparti à l'unité sur les articles
 *     du groupe, exactement comme dans le suivi Excel ;
 *  2. le coût de revient (achat + transport) est figé sur chaque ligne ;
 *  3. le stock des produits est incrémenté, avec un mouvement RESTOCK qui
 *     laisse une piste d'audit ;
 *  4. le coût de revient moyen du produit est recalculé.
 *
 * L'opération est transactionnelle et refusée sur un arrivage déjà réceptionné :
 * la rejouer doublerait le stock.
 */
export async function receiveShipment(id: string) {
  const shipment = await getDraft(id)
  if (shipment.items.length === 0) {
    throw new AppError('Cet arrivage ne contient aucune ligne : rien à réceptionner.', 400)
  }

  // Un article hors groupe n'aurait pas de transport : son coût de revient
  // serait sous-évalué, et la marge avec.
  const ungrouped = shipment.items.filter((i) => !i.groupId)
  if (ungrouped.length) {
    throw new AppError(
      `${ungrouped.length} produit(s) ne sont dans aucun groupe : répartissez-les avant de réceptionner.`,
      400,
    )
  }

  // Répartition à l'unité, comme dans le classeur : le transport du groupe
  // divisé par le nombre d'articles du groupe, quelle que soit leur valeur.
  const unitShippingByGroup = new Map<string, number>()
  for (const group of shipment.groups) {
    const qty = shipment.items
      .filter((i) => i.groupId === group.id)
      .reduce((sum, i) => sum + i.quantity, 0)
    // Un groupe vide perdrait son transport sans le répercuter nulle part.
    if (qty === 0) {
      throw new AppError(`Le groupe ${group.code} est vide : ajoutez-y des produits ou supprimez-le.`, 400)
    }
    unitShippingByGroup.set(group.id, num(group.shippingCost) / qty)
  }
  const groupCode = new Map(shipment.groups.map((g) => [g.id, g.code]))
  const receivedAt = new Date()

  await prisma.$transaction(async (tx) => {
    for (const item of shipment.items) {
      const unitShipping = unitShippingByGroup.get(item.groupId!) ?? 0
      const landedCost = num(item.unitCost) + unitShipping

      await tx.shipmentItem.update({
        where: { id: item.id },
        data: {
          unitShipping: new Prisma.Decimal(unitShipping.toFixed(2)),
          landedCost: new Prisma.Decimal(landedCost.toFixed(2)),
        },
      })

      await tx.inventory.create({
        data: {
          productId: item.productId,
          storeId: item.storeId,
          quantity: item.quantity,
          type: 'RESTOCK',
          reference: shipment.code,
          note: `Arrivage ${shipment.code} · groupe ${groupCode.get(item.groupId!)}`,
        },
      })

      // Le détail par boutique et le total de l'entreprise avancent ensemble :
      // `products.stock` reste ce que lit la boutique en ligne.
      await tx.storeStock.upsert({
        where: { productId_storeId: { productId: item.productId, storeId: item.storeId } },
        create: { productId: item.productId, storeId: item.storeId, quantity: item.quantity },
        update: { quantity: { increment: item.quantity } },
      })

      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
    }

    // Après la mise à jour des lignes et du statut, sinon les nouveaux coûts
    // ne seraient pas encore visibles pour la moyenne.
    await tx.shipment.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt },
    })

    for (const productId of new Set(shipment.items.map((i) => i.productId))) {
      await recomputeCostPrice(tx, productId)
    }
  })

  return getShipment(id)
}

/**
 * Annule un arrivage encore en brouillon. Une réception ne s'annule pas : le
 * stock et les coûts sont déjà partis dans les ventes. Pour corriger une
 * réception erronée, passer par un mouvement de stock d'ajustement.
 */
export async function cancelShipment(id: string) {
  await getDraft(id)
  return prisma.shipment.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: SHIPMENT_INCLUDE,
  })
}

export async function deleteShipment(id: string) {
  const shipment = await getShipment(id)
  if (shipment.status === 'RECEIVED') {
    throw new AppError(
      'Un arrivage réceptionné ne se supprime pas : il porte l’historique du stock et des coûts.',
      409,
    )
  }
  await prisma.shipment.delete({ where: { id } })
}
