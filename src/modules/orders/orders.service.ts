import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateOrderInput, OrderQuery } from './orders.types.js'
import { effectivePrice } from '../products/pricing.js'

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `WA-${ts}-${rand}`
}

export async function listOrders(query: OrderQuery, userId?: string, isAdmin = false) {
  const { page, limit, status, sortOrder } = query
  const where: Prisma.OrderWhereInput = {
    ...(status && { status }),
    ...(!isAdmin && userId ? { userId } : {}),
    ...(isAdmin && query.userId ? { userId: query.userId } : {}),
  }

  const [total, items] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        items: { include: { product: { select: { name: true, images: { take: 1 } } } } },
        address: true,
        payment: true,
      },
      orderBy: { createdAt: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
}

export async function getOrder(id: string, userId?: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, slug: true, images: { take: 1 } } },
          variant: true,
        },
      },
      address: true,
      payment: true,
      coupon: { select: { code: true, type: true, value: true } },
    },
  })

  if (!order) throw new AppError('Commande introuvable', 404)
  if (userId && order.userId !== userId) throw new AppError('Accès refusé', 403)

  return order
}

export async function createOrder(input: CreateOrderInput, userId?: string) {
  const productIds = input.items.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: { variants: true },
  })

  if (products.length !== input.items.length) {
    throw new AppError('Un ou plusieurs produits sont introuvables ou inactifs', 400)
  }

  let subtotal = 0
  const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = input.items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!
    const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : null
    // Prix promo si la fenêtre est ouverte au moment de la commande — sinon on
    // facturerait le prix normal pendant une promo en cours.
    const price = Number(variant?.price ?? effectivePrice(product))
    const total = price * item.quantity
    subtotal += total

    return {
      productId: item.productId,
      variantId: item.variantId ?? null,
      name: product.name + (variant ? ` — ${variant.name}` : ''),
      sku: variant?.sku ?? product.sku ?? null,
      quantity: item.quantity,
      price,
      total,
      options: variant?.options != null ? (variant.options as Prisma.InputJsonValue) : Prisma.JsonNull,
    }
  })

  let discountAmount = 0
  let couponId: string | undefined

  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode } })
    if (coupon && coupon.isActive) {
      if (coupon.type === 'PERCENTAGE') {
        discountAmount = (subtotal * Number(coupon.value)) / 100
        if (coupon.maxDiscount) discountAmount = Math.min(discountAmount, Number(coupon.maxDiscount))
      } else {
        discountAmount = Number(coupon.value)
      }
      couponId = coupon.id
      await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } })
    }
  }

  const total = Math.max(0, subtotal - discountAmount)

  const order = await prisma.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      userId,
      addressId: input.addressId,
      couponId,
      notes: input.notes,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      subtotal,
      discountAmount,
      total,
      items: { create: orderItems },
      payment: { create: { amount: total, status: 'PENDING', method: 'CASH' } },
    },
    include: { items: true, payment: true, address: true },
  })

  return order
}

export async function updateOrderStatus(id: string, status: string) {
  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) throw new AppError('Commande introuvable', 404)
  return prisma.order.update({ where: { id }, data: { status: status as Prisma.EnumOrderStatusFilter['equals'] } })
}

/**
 * Chiffres du tableau de bord du back-office, tous calculés sur la base — le
 * précédent affichait six mois de données inventées.
 *
 * `withRevenue` sépare les montants du reste : la recette et son évolution ne
 * sortent que pour un SUPER_ADMIN, comme partout ailleurs. Les décomptes, eux,
 * sont visibles de tout le back-office.
 */
export async function orderStats(withRevenue: boolean) {
  const now = new Date()
  // Premier jour du mois, cinq mois en arrière : six mois avec le mois courant.
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [total, pending, stores, recent] = await Promise.all([
    prisma.order.count({ where: { status: { not: 'CANCELLED' } } }),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.store.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.order.findMany({
      where: { status: { not: 'CANCELLED' }, createdAt: { gte: from } },
      select: {
        createdAt: true,
        total: true,
        storeId: true,
        // Une commande compte toujours comme commande, mais son montant
        // n'entre dans la recette qu'une fois encaissé : on ne paie pas sur
        // le site.
        payment: { select: { status: true } },
      },
    }),
  ])

  // Agrégation en mémoire : un GROUP BY sur un mois local dépendrait du fuseau
  // du serveur MySQL, alors que la journée de caisse est celle d'Abidjan.
  const buckets = new Map<string, { orders: number; revenue: number }>()
  for (let i = 0; i < 6; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1)
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, {
      orders: 0,
      revenue: 0,
    })
  }

  const byStore = new Map(stores.map((s) => [s.id, { ...s, orders: 0, revenue: 0 }]))

  for (const order of recent) {
    const key = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, '0')}`
    const paid = order.payment?.status === 'PAID' ? Number(order.total) : 0

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.orders += 1
      bucket.revenue += paid
    }
    const store = order.storeId ? byStore.get(order.storeId) : undefined
    if (store) {
      store.orders += 1
      store.revenue += paid
    }
  }

  const monthly = [...buckets].map(([month, v]) => ({
    month,
    orders: v.orders,
    ...(withRevenue ? { revenue: v.revenue } : {}),
  }))

  return {
    totalOrders: total,
    pendingOrders: pending,
    monthly,
    byStore: [...byStore.values()].map((s) => ({
      id: s.id,
      name: s.name,
      orders: s.orders,
      ...(withRevenue ? { revenue: s.revenue } : {}),
    })),
    withRevenue,
  }
}
