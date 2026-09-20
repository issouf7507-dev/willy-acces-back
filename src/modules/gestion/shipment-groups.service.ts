import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import { getOpen, nextCode, num, refreshShipmentStatus } from './shipments.service.js'
import type {
  CreateShipmentGroupInput,
  ShipmentGroupQuery,
  UpdateShipmentGroupInput,
} from './shipments.types.js'

const GROUP_INCLUDE = {
  shipment: { select: { id: true, code: true, label: true, status: true } },
  items: {
    include: {
      shipmentItem: {
        select: {
          id: true,
          quantity: true,
          unitCost: true,
          plannedPrice: true,
          product: { select: { id: true, name: true, sku: true, stock: true } },
          store: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ShipmentGroupInclude

type Line = { shipmentItemId: string; quantity: number }

const nextGroupCode = async () =>
  nextCode(await prisma.shipmentGroup.findMany({ where: { code: { startsWith: 'G' } }, select: { code: true } }), 'G')

export async function listGroups(query: ShipmentGroupQuery) {
  return prisma.shipmentGroup.findMany({
    where: {
      ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    include: GROUP_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
}

export async function getGroup(id: string) {
  const group = await prisma.shipmentGroup.findUnique({ where: { id }, include: GROUP_INCLUDE })
  if (!group) throw new AppError('Groupe introuvable', 404)
  return group
}

/** Un groupe réceptionné est figé : il a déjà bougé le stock et les coûts. */
async function getDraft(id: string) {
  const group = await getGroup(id)
  if (group.status !== 'DRAFT') {
    throw new AppError('Ce groupe est déjà réceptionné : il n’est plus modifiable.', 409)
  }
  return group
}

async function assertCodeFree(code: string, exceptId?: string) {
  const clash = await prisma.shipmentGroup.findUnique({ where: { code } })
  if (clash && clash.id !== exceptId) {
    throw new AppError(`Le code ${code} est déjà pris par un autre groupe.`, 409)
  }
}

/**
 * Vérifie les quantités livrées : chaque ligne appartient à l'arrivage, et on
 * ne livre jamais plus que le reste à recevoir — commandé moins ce que les
 * autres groupes (reçus ou en brouillon) ont déjà pris.
 */
async function assertLines(shipmentId: string, lines: Line[], exceptGroupId?: string) {
  const ids = lines.map((l) => l.shipmentItemId)
  if (new Set(ids).size !== ids.length) {
    throw new AppError('Un même produit apparaît deux fois dans le groupe.', 400)
  }

  const items = await prisma.shipmentItem.findMany({
    where: { id: { in: ids }, shipmentId },
    select: {
      id: true,
      quantity: true,
      product: { select: { name: true } },
      receipts: {
        where: exceptGroupId ? { groupId: { not: exceptGroupId } } : {},
        select: { quantity: true },
      },
    },
  })
  if (items.length !== ids.length) {
    throw new AppError('Certains produits n’appartiennent pas à cet arrivage.', 400)
  }

  const byId = new Map(items.map((i) => [i.id, i]))
  for (const line of lines) {
    const item = byId.get(line.shipmentItemId)!
    const remaining = item.quantity - item.receipts.reduce((sum, r) => sum + r.quantity, 0)
    if (line.quantity > remaining) {
      throw new AppError(
        `${item.product.name} : ${line.quantity} demandé(s), mais il n’en reste que ${remaining} à recevoir.`,
        400,
      )
    }
  }
}

export async function createGroup(input: CreateShipmentGroupInput) {
  const { shipmentId, items, ...data } = input
  await getOpen(shipmentId)
  await assertLines(shipmentId, items)
  const code = data.code ?? (await nextGroupCode())
  await assertCodeFree(code)

  const group = await prisma.shipmentGroup.create({
    data: { ...data, code, shipmentId, items: { create: items } },
  })
  return getGroup(group.id)
}

export async function updateGroup(id: string, input: UpdateShipmentGroupInput) {
  const group = await getDraft(id)
  await getOpen(group.shipmentId)
  const { items, ...data } = input
  if (data.code) await assertCodeFree(data.code, id)
  if (items) await assertLines(group.shipmentId, items, id)

  await prisma.$transaction(async (tx) => {
    await tx.shipmentGroup.update({ where: { id }, data })
    if (items) {
      await tx.shipmentGroupItem.deleteMany({ where: { groupId: id } })
      await tx.shipmentGroupItem.createMany({
        data: items.map((l) => ({ ...l, groupId: id })),
      })
    }
  })
  return getGroup(id)
}

export async function removeGroup(id: string) {
  await getDraft(id)
  await prisma.shipmentGroup.delete({ where: { id } })
}

/**
 * Coût de revient moyen d'un produit, pondéré par les quantités de toutes les
 * livraisons réceptionnées.
 *
 * C'est ce chiffre qui corrige l'erreur du fichier Excel, dont la marge se
 * basait sur le seul prix d'achat et ignorait le transport comme la douane —
 * elle était donc systématiquement surévaluée.
 */
async function recomputeCostPrice(tx: Prisma.TransactionClient, productId: string) {
  const lines = await tx.shipmentGroupItem.findMany({
    where: { shipmentItem: { productId }, group: { status: 'RECEIVED' } },
    select: { quantity: true, landedCost: true },
  })

  const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0)
  if (totalQty === 0) return

  const totalCost = lines.reduce((sum, l) => sum + num(l.landedCost) * l.quantity, 0)
  await tx.product.update({
    where: { id: productId },
    data: { costPrice: new Prisma.Decimal((totalCost / totalQty).toFixed(2)) },
  })
}

/**
 * Réceptionne une livraison. C'est l'unique moment où elle touche au stock :
 *
 *  1. le transport et la douane du groupe sont répartis à l'unité sur les
 *     articles livrés, exactement comme dans le suivi Excel ;
 *  2. le coût de revient (achat + transport + douane) est figé sur chaque
 *     ligne ;
 *  3. le stock des produits est incrémenté, avec un mouvement RESTOCK qui
 *     laisse une piste d'audit ;
 *  4. l'arrivage passe partiel ou complet, et le coût de revient moyen des
 *     produits est recalculé.
 *
 * L'opération est transactionnelle et refusée sur un groupe déjà réceptionné :
 * la rejouer doublerait le stock.
 */
export async function receiveGroup(id: string) {
  const group = await getDraft(id)
  const shipment = await getOpen(group.shipmentId)
  if (group.items.length === 0) {
    throw new AppError('Ce groupe ne contient aucun produit : rien à réceptionner.', 400)
  }

  const totalQty = group.items.reduce((sum, l) => sum + l.quantity, 0)
  // Répartition à l'unité, comme dans le classeur : les frais du groupe
  // divisés par le nombre d'articles livrés, quelle que soit leur valeur.
  // La douane est celle payée sur cette livraison, pas celle annoncée pour
  // le lot entier (`shipment.customsCost`), qui reste prévisionnelle.
  const unitShipping = num(group.shippingCost) / totalQty
  const unitCustoms = num(group.customsCost) / totalQty

  await prisma.$transaction(async (tx) => {
    for (const line of group.items) {
      const item = line.shipmentItem
      const landedCost = num(item.unitCost) + unitShipping + unitCustoms

      await tx.shipmentGroupItem.update({
        where: { id: line.id },
        data: {
          unitShipping: new Prisma.Decimal(unitShipping.toFixed(2)),
          unitCustoms: new Prisma.Decimal(unitCustoms.toFixed(2)),
          landedCost: new Prisma.Decimal(landedCost.toFixed(2)),
        },
      })

      await tx.inventory.create({
        data: {
          productId: item.product.id,
          storeId: item.store.id,
          quantity: line.quantity,
          type: 'RESTOCK',
          reference: group.code,
          note: `Arrivage ${shipment.code} · groupe ${group.code}`,
        },
      })

      // Le détail par boutique et le total de l'entreprise avancent ensemble :
      // `products.stock` reste ce que lit la boutique en ligne.
      await tx.storeStock.upsert({
        where: { productId_storeId: { productId: item.product.id, storeId: item.store.id } },
        create: { productId: item.product.id, storeId: item.store.id, quantity: line.quantity },
        update: { quantity: { increment: line.quantity } },
      })

      await tx.product.update({
        where: { id: item.product.id },
        data: { stock: { increment: line.quantity } },
      })
    }

    // Après la mise à jour des lignes et du statut, sinon les nouveaux coûts
    // ne seraient pas encore visibles pour la moyenne.
    await tx.shipmentGroup.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    })
    await refreshShipmentStatus(tx, group.shipmentId)

    for (const productId of new Set(group.items.map((l) => l.shipmentItem.product.id))) {
      await recomputeCostPrice(tx, productId)
    }
  })

  return getGroup(id)
}
