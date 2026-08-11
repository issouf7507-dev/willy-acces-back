import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import { effectivePrice } from '../products/pricing.js'
import { isPreorderOpen } from '../products/preorder.js'
import type { CreatePreorderInput, UpdatePreorderInput, PreorderQuery } from './preorders.types.js'

export async function createPreorder(input: CreatePreorderInput) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } })
  if (!product || !product.isActive) throw new AppError('Produit introuvable', 404)

  // On refuse une réservation hors fenêtre : avant l'ouverture le produit n'est
  // pas encore proposé, et après la sortie il s'achète normalement — passer par
  // la précommande contournerait le tunnel de commande et le paiement.
  if (!isPreorderOpen(product)) {
    throw new AppError("Les précommandes ne sont pas ouvertes pour ce produit", 400)
  }

  // Nom et prix recopiés à l'instant de la demande : la réservation doit rester
  // lisible même si le produit change de tarif ou disparaît ensuite.
  return prisma.preorderRequest.create({
    data: {
      productId: product.id,
      productName: product.name,
      unitPrice: effectivePrice(product),
      releaseDate: product.releaseDate,
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      color: input.color || null,
      quantity: input.quantity,
      message: input.message,
    },
  })
}

export async function listPreorders(query: PreorderQuery) {
  const { page, limit, status } = query

  const where: Prisma.PreorderRequestWhereInput = {
    ...(status && { status }),
  }

  const [total, items] = await prisma.$transaction([
    prisma.preorderRequest.count({ where }),
    prisma.preorderRequest.findMany({
      where,
      include: { product: { select: { id: true, slug: true, images: { take: 1 } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return {
    items,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}

export async function getPreorder(id: string) {
  const request = await prisma.preorderRequest.findUnique({ where: { id } })
  if (!request) throw new AppError('Demande de précommande introuvable', 404)
  return request
}

export async function updatePreorder(id: string, input: UpdatePreorderInput) {
  await getPreorder(id)
  return prisma.preorderRequest.update({ where: { id }, data: input })
}

export async function deletePreorder(id: string) {
  await getPreorder(id)
  await prisma.preorderRequest.delete({ where: { id } })
}
