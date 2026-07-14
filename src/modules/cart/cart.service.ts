import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'

async function getOrCreateCart(userId?: string, sessionId?: string) {
  if (!userId && !sessionId) throw new AppError('userId ou sessionId requis', 400)

  const existing = await prisma.cart.findFirst({
    where: userId ? { userId } : { sessionId },
    include: { items: { include: { product: { include: { images: { take: 1 } } }, variant: true } } },
  })

  if (existing) return existing

  return prisma.cart.create({
    data: { userId, sessionId },
    include: { items: { include: { product: { include: { images: { take: 1 } } }, variant: true } } },
  })
}

export async function getCart(userId?: string, sessionId?: string) {
  return getOrCreateCart(userId, sessionId)
}

export async function addToCart(
  productId: string,
  quantity: number,
  userId?: string,
  sessionId?: string,
  variantId?: string,
) {
  const cart = await getOrCreateCart(userId, sessionId)
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { variants: true } })
  if (!product || !product.isActive) throw new AppError('Produit introuvable', 404)

  const variant = variantId ? product.variants.find((v) => v.id === variantId) : null
  const price = Number(variant?.price ?? product.price)

  const existing = await prisma.cartItem.findUnique({
    where: {
      cartId_productId_variantId: {
        cartId: cart.id,
        productId,
        variantId: (variantId ?? null) as string,
      },
    },
  })

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity }, price },
    })
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, variantId, quantity, price },
    })
  }

  return getOrCreateCart(userId, sessionId)
}

export async function updateCartItem(itemId: string, quantity: number, userId?: string, sessionId?: string) {
  const item = await prisma.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } })
  if (!item) throw new AppError('Article introuvable', 404)

  const owns = userId ? item.cart.userId === userId : item.cart.sessionId === sessionId
  if (!owns) throw new AppError('Accès refusé', 403)

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: itemId } })
  } else {
    await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } })
  }

  return getOrCreateCart(userId, sessionId)
}

export async function clearCart(userId?: string, sessionId?: string) {
  const cart = await prisma.cart.findFirst({ where: userId ? { userId } : { sessionId } })
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
}
