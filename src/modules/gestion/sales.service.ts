import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import { effectivePrice } from '../products/pricing.js'
import { findOrCreateByPhone } from './customers.service.js'
import type { CashInInput, CreateSaleInput, DailyReportQuery, SalesQuery } from './sales.types.js'
import { PAID_ORDER } from '../../lib/paid-orders.js'

export interface Actor {
  userId: string
  role: string
}

const SALE_INCLUDE = {
  items: true,
  store: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
  payment: true,
} satisfies Prisma.OrderInclude

/** Même forme que les commandes du site : `WA-<base36>-<aléa>`. */
function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `WA-${ts}-${rand}`
}

/** Bornes d'une journée locale, pour filtrer sur `createdAt`. */
function dayBounds(date: string): [Date, Date] {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(`${date}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return [start, end]
}

/**
 * Une vendeuse encaisse dans sa boutique et sous son nom, rien d'autre : sans
 * cette contrainte, le suivi par vendeuse et le comparatif entre boutiques
 * pourraient être faussés depuis le comptoir.
 */
async function resolveSellerAndStore(input: CreateSaleInput, actor: Actor) {
  if (actor.role !== 'VENDEUR') {
    return { sellerId: input.sellerId ?? actor.userId, storeId: input.storeId }
  }

  const me = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { storeId: true },
  })
  if (!me?.storeId) {
    throw new AppError(
      'Votre compte n’est rattaché à aucune boutique : demandez à un administrateur de vous en affecter une.',
      403,
    )
  }
  if (input.storeId !== me.storeId) {
    throw new AppError('Vous ne pouvez enregistrer une vente que dans votre boutique.', 403)
  }
  if (input.sellerId && input.sellerId !== actor.userId) {
    throw new AppError('Vous ne pouvez enregistrer une vente qu’à votre nom.', 403)
  }
  return { sellerId: actor.userId, storeId: me.storeId }
}

/**
 * Enregistre une vente au comptoir.
 *
 * Une vente comptoir est une commande comme une autre — `channel: IN_STORE` —
 * et non un modèle parallèle : recette, marge, historique client et stock se
 * lisent ainsi au même endroit que les commandes du site, sans avoir à
 * additionner deux sources.
 *
 * Elle est encaissée immédiatement : statut `DELIVERED`, paiement `PAID`.
 */
export async function createSale(input: CreateSaleInput, actor: Actor) {
  const { sellerId, storeId } = await resolveSellerAndStore(input, actor)

  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) throw new AppError('Boutique introuvable', 404)
  if (!store.isActive) throw new AppError(`« ${store.name} » est désactivée.`, 400)

  // Une même référence peut apparaître deux fois au comptoir (deux coloris,
  // deux remises) : on regroupe par produit pour le contrôle de stock.
  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((i) => i.productId) }, isActive: true },
  })
  const byId = new Map(products.map((p) => [p.id, p]))

  const missing = input.items.find((i) => !byId.has(i.productId))
  if (missing) throw new AppError('Un produit de la vente est introuvable ou inactif', 400)

  const neededByProduct = new Map<string, number>()
  for (const item of input.items) {
    neededByProduct.set(item.productId, (neededByProduct.get(item.productId) ?? 0) + item.quantity)
  }

  // Le stock qui compte au comptoir est celui de la boutique, pas le total de
  // l'entreprise : vendre à Cocody ce qui dort à la Palmeraie donnerait deux
  // stocks faux d'un coup.
  const onHand = await prisma.storeStock.findMany({
    where: { storeId, productId: { in: [...neededByProduct.keys()] } },
    select: { productId: true, quantity: true },
  })
  const stockByProduct = new Map(onHand.map((r) => [r.productId, r.quantity]))

  for (const [productId, needed] of neededByProduct) {
    const product = byId.get(productId)!
    if (!product.trackInventory) continue

    const available = stockByProduct.get(productId) ?? 0
    if (available < needed) {
      throw new AppError(
        `Stock insuffisant pour « ${product.name} » à ${store.name} : ${available} en stock, ${needed} demandé(s).` +
          (product.stock > available
            ? ` L’entreprise en a ${product.stock} au total : faites un transfert depuis une autre boutique.`
            : ' Ajustez le stock si l’article est bien présent.'),
        409,
      )
    }
  }

  let subtotal = 0
  let discountTotal = 0
  const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = input.items.map((item) => {
    const product = byId.get(item.productId)!
    const price = item.unitPrice ?? Number(effectivePrice(product))
    const gross = price * item.quantity
    if (item.discountAmount > gross) {
      throw new AppError(
        `La remise sur « ${product.name} » dépasse le prix de la ligne.`,
        400,
      )
    }
    subtotal += gross
    discountTotal += item.discountAmount

    return {
      productId: item.productId,
      variantId: null,
      name: product.name,
      sku: product.sku ?? null,
      quantity: item.quantity,
      price,
      discountAmount: item.discountAmount,
      discountReason: item.discountReason ?? null,
      // Net de remise : c'est lui qui sert de base aux recettes et aux marges.
      total: gross - item.discountAmount,
      options: Prisma.JsonNull,
    }
  })

  let customerId = input.customerId
  if (!customerId && input.customer) {
    const customer = await findOrCreateByPhone(input.customer.name, input.customer.phone)
    customerId = customer.id
  }

  const total = subtotal - discountTotal
  const soldAt = input.soldAt ? new Date(input.soldAt) : new Date()

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        storeId,
        sellerId,
        customerId,
        channel: 'IN_STORE',
        // Encaissée et remise en main propre : la vente est close d'emblée.
        status: 'DELIVERED',
        subtotal,
        discountAmount: discountTotal,
        total,
        notes: input.notes,
        createdAt: soldAt,
        items: { create: orderItems },
        payment: {
          create: {
            amount: total,
            status: 'PAID',
            method: input.paymentMethod,
            paidAt: soldAt,
          },
        },
      },
      include: SALE_INCLUDE,
    })

    for (const [productId, quantity] of neededByProduct) {
      // `upsert` et non `update` : un produit non suivi en stock peut n'avoir
      // aucune ligne pour cette boutique, et la vente ne doit pas échouer.
      await tx.storeStock.upsert({
        where: { productId_storeId: { productId, storeId } },
        create: { productId, storeId, quantity: -quantity },
        update: { quantity: { decrement: quantity } },
      })
      await tx.product.update({
        where: { id: productId },
        data: { stock: { decrement: quantity } },
      })
      // Quantité négative : convention des mouvements de sortie.
      await tx.inventory.create({
        data: {
          productId,
          storeId,
          quantity: -quantity,
          type: 'SALE',
          reference: created.orderNumber,
          note: `Vente ${store.name}`,
        },
      })
    }

    return created
  })

  return order
}

export async function listSales(query: SalesQuery) {
  const where: Prisma.OrderWhereInput = {
    // Une commande non encaissée n'est pas une vente : elle vit dans la file
    // « à encaisser », pas dans l'historique des ventes.
    ...PAID_ORDER,
    ...(query.storeId ? { storeId: query.storeId } : {}),
    ...(query.sellerId ? { sellerId: query.sellerId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: dayBounds(query.from)[0] } : {}),
            ...(query.to ? { lt: dayBounds(query.to)[1] } : {}),
          },
        }
      : {}),
  }

  return prisma.order.findMany({
    where,
    include: SALE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: query.limit,
  })
}

export async function getSale(id: string) {
  const sale = await prisma.order.findUnique({ where: { id }, include: SALE_INCLUDE })
  if (!sale) throw new AppError('Vente introuvable', 404)
  return sale
}

/**
 * Recettes jour par jour et boutique par boutique — l'équivalent de l'onglet
 * « Recettes journalières », qui n'a rien à stocker : tout se déduit des ventes.
 *
 * Le total retenu est `Order.total`, donc net des remises accordées.
 */
export async function dailyRevenue(query: DailyReportQuery) {
  const to = query.to ? dayBounds(query.to)[1] : dayBounds(new Date().toISOString().slice(0, 10))[1]
  const from = query.from
    ? dayBounds(query.from)[0]
    : new Date(to.getTime() - 30 * 24 * 3600 * 1000)

  const [stores, orders] = await Promise.all([
    prisma.store.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.order.findMany({
      where: { ...PAID_ORDER, createdAt: { gte: from, lt: to } },
      select: { createdAt: true, storeId: true, total: true },
    }),
  ])

  // Agrégation en mémoire : un GROUP BY sur une date locale dépendrait du
  // fuseau du serveur MySQL, alors que la journée de caisse est celle d'Abidjan.
  const byDay = new Map<string, Map<string, number>>()
  for (const order of orders) {
    const day = order.createdAt.toISOString().slice(0, 10)
    const row = byDay.get(day) ?? new Map<string, number>()
    const key = order.storeId ?? 'unassigned'
    row.set(key, (row.get(key) ?? 0) + Number(order.total))
    byDay.set(day, row)
  }

  const days = [...byDay.entries()]
    .map(([date, row]) => ({
      date,
      byStore: Object.fromEntries(row),
      total: [...row.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return {
    from: from.toISOString().slice(0, 10),
    to: new Date(to.getTime() - 1).toISOString().slice(0, 10),
    stores,
    days,
    total: days.reduce((sum, d) => sum + d.total, 0),
  }
}

/**
 * Les commandes du site en attente d'encaissement.
 *
 * C'est la file de travail du comptoir : ce qui a été commandé et pas encore
 * payé, du plus ancien au plus récent — une commande qui traîne est une vente
 * qui ne se fera peut-être pas.
 */
export async function listUnpaidOrders(limit = 50) {
  return prisma.order.findMany({
    where: {
      status: { not: 'CANCELLED' },
      OR: [{ payment: { is: { status: { not: 'PAID' } } } }, { payment: { is: null } }],
    },
    include: SALE_INCLUDE,
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
}

/**
 * Encaisse une commande déjà passée, au lieu de la ressaisir.
 *
 * On ne paie pas sur le site : une commande web reste une demande jusqu'à ce
 * que quelqu'un règle. C'est ici que la demande devient une vente — **sur le
 * même enregistrement**, pas sur un second. La retaper à la caisse compterait
 * la recette deux fois et laisserait une commande fantôme éternellement en
 * attente.
 *
 * L'effet est celui d'une vente comptoir : la commande est rattachée à la
 * boutique qui fournit la marchandise et à la personne qui encaisse, le stock
 * de cette boutique sort, le paiement passe `PAID`.
 */
export async function cashInOrder(
  orderId: string,
  input: CashInInput,
  actor: Actor,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, payment: true },
  })
  if (!order) throw new AppError('Commande introuvable', 404)
  if (order.status === 'CANCELLED') throw new AppError('Cette commande est annulée.', 409)
  if (order.payment?.status === 'PAID') {
    throw new AppError('Cette commande est déjà encaissée.', 409)
  }

  const { sellerId, storeId } = await resolveSellerAndStore(
    { storeId: input.storeId, sellerId: input.sellerId } as CreateSaleInput,
    actor,
  )

  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) throw new AppError('Boutique introuvable', 404)
  if (!store.isActive) throw new AppError(`« ${store.name} » est désactivée.`, 400)

  // Les lignes d'une commande peuvent porter deux fois le même produit.
  const neededByProduct = new Map<string, number>()
  for (const item of order.items) {
    if (!item.productId) continue
    neededByProduct.set(
      item.productId,
      (neededByProduct.get(item.productId) ?? 0) + item.quantity,
    )
  }

  const products = await prisma.product.findMany({
    where: { id: { in: [...neededByProduct.keys()] } },
    select: { id: true, name: true, stock: true, trackInventory: true },
  })
  const byId = new Map(products.map((p) => [p.id, p]))

  const onHand = await prisma.storeStock.findMany({
    where: { storeId, productId: { in: [...neededByProduct.keys()] } },
    select: { productId: true, quantity: true },
  })
  const stockByProduct = new Map(onHand.map((r) => [r.productId, r.quantity]))

  for (const [productId, needed] of neededByProduct) {
    const product = byId.get(productId)
    if (!product || !product.trackInventory) continue

    const available = stockByProduct.get(productId) ?? 0
    if (available < needed) {
      throw new AppError(
        `Stock insuffisant pour « ${product.name} » à ${store.name} : ${available} en stock, ${needed} demandé(s).` +
          (product.stock > available
            ? ' L’entreprise en a davantage au total : faites un transfert depuis une autre boutique.'
            : ''),
        409,
      )
    }
  }

  const paidAt = new Date()

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        storeId,
        sellerId,
        // Encaissée et remise : la commande est close, comme une vente comptoir.
        status: 'DELIVERED',
        payment: {
          upsert: {
            create: {
              amount: order.total,
              status: 'PAID',
              method: input.paymentMethod,
              paidAt,
            },
            update: { status: 'PAID', method: input.paymentMethod, paidAt },
          },
        },
      },
      include: SALE_INCLUDE,
    })

    for (const [productId, quantity] of neededByProduct) {
      await tx.storeStock.upsert({
        where: { productId_storeId: { productId, storeId } },
        create: { productId, storeId, quantity: -quantity },
        update: { quantity: { decrement: quantity } },
      })
      await tx.product.update({
        where: { id: productId },
        data: { stock: { decrement: quantity } },
      })
      await tx.inventory.create({
        data: {
          productId,
          storeId,
          quantity: -quantity,
          type: 'SALE',
          reference: updated.orderNumber,
          note: `Encaissement commande ${store.name}`,
        },
      })
    }

    return updated
  })
}
