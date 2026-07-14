import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateCouponInput } from './coupons.types.js'

export async function listCoupons() {
  return prisma.coupon.findMany({
    include: { categories: { include: { category: true } }, products: { include: { product: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getCoupon(idOrCode: string) {
  const coupon = await prisma.coupon.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
    include: { categories: true, products: true },
  })
  if (!coupon) throw new AppError('Coupon introuvable', 404)
  return coupon
}

export async function validateCoupon(code: string, subtotal: number) {
  const coupon = await prisma.coupon.findUnique({ where: { code } })
  if (!coupon || !coupon.isActive) throw new AppError('Coupon invalide', 400)

  const now = new Date()
  if (coupon.startDate && coupon.startDate > now) throw new AppError('Coupon pas encore actif', 400)
  if (coupon.endDate && coupon.endDate < now) throw new AppError('Coupon expiré', 400)
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new AppError('Coupon épuisé', 400)
  if (coupon.minPurchase && subtotal < Number(coupon.minPurchase)) {
    throw new AppError(`Achat minimum requis : ${coupon.minPurchase} FCFA`, 400)
  }

  let discount: number
  if (coupon.type === 'PERCENTAGE') {
    discount = (subtotal * Number(coupon.value)) / 100
    if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount))
  } else {
    discount = Math.min(Number(coupon.value), subtotal)
  }

  return { coupon, discount }
}

export async function createCoupon(input: CreateCouponInput) {
  const { categoryIds, productIds, ...data } = input
  return prisma.coupon.create({
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      categories: categoryIds?.length
        ? { create: categoryIds.map((id) => ({ categoryId: id })) }
        : undefined,
      products: productIds?.length
        ? { create: productIds.map((id) => ({ productId: id })) }
        : undefined,
    },
  })
}

export async function updateCoupon(id: string, input: Partial<CreateCouponInput>) {
  await getCoupon(id)
  const { categoryIds, productIds, ...data } = input
  return prisma.coupon.update({
    where: { id },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    },
  })
}

export async function deleteCoupon(id: string) {
  await getCoupon(id)
  await prisma.coupon.delete({ where: { id } })
}
