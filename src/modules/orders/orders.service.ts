import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateOrderInput, OrderQuery } from './orders.types.js'

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
    const price = Number(variant?.price ?? product.price)
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
