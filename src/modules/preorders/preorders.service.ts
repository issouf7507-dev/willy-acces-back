import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import { effectivePrice } from '../products/pricing.js'
import { isPreorderOpen } from '../products/preorder.js'
import type { CreatePreorderInput, UpdatePreorderInput, PreorderQuery } from './preorders.types.js'

export async function createPreorder(input: CreatePreorderInput) {
  // Une seule requête pour toutes les lignes, puis on relit chaque produit
  // depuis cette liste : autant d'allers-retours en base que de lignes serait
  // inutile, et le panier peut en contenir plusieurs dizaines.
  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((i) => i.productId) } },
  })
  const byId = new Map(products.map((p) => [p.id, p]))

  const items = input.items.map((item) => {
    const product = byId.get(item.productId)
    if (!product || !product.isActive) throw new AppError('Produit introuvable', 404)

    // On refuse une réservation hors fenêtre : avant l'ouverture le produit n'est
    // pas encore proposé, et après la sortie il s'achète normalement — passer par
    // la précommande contournerait le tunnel de commande et le paiement.
    if (!isPreorderOpen(product)) {
      throw new AppError(`Les précommandes ne sont pas ouvertes pour ${product.name}`, 400)
    }

    // Nom et prix recopiés à l'instant de la demande : la réservation doit rester
    // lisible même si le produit change de tarif ou disparaît ensuite.
    return {
      productId: product.id,
      productName: product.name,
      unitPrice: effectivePrice(product),
      releaseDate: product.releaseDate,
      color: item.color || null,
      quantity: item.quantity,
    }
  })

  return prisma.preorderRequest.create({
    data: {
      name: input.name,
      phone: input.phone,
      deliveryPlace: input.deliveryPlace,
      items: { create: items },
    },
    include: { items: true },
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
      include: {
        items: {
          include: {
        product: {
          select: {
            id: true,
            slug: true,
            sku: true,
            stock: true,
            isActive: true,
            images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
          },
        },
      },
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
  const request = await prisma.preorderRequest.findUnique({
    where: { id },
    include: {
      items: {
        include: {
        product: {
          select: {
            id: true,
            slug: true,
            sku: true,
            stock: true,
            isActive: true,
            images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
        },
      },
    },
  })
  if (!request) throw new AppError('Demande de précommande introuvable', 404)
  return request
}

export async function updatePreorder(id: string, input: UpdatePreorderInput) {
  await getPreorder(id)
  return prisma.preorderRequest.update({ where: { id }, data: input, include: { items: true } })
}

export async function deletePreorder(id: string) {
  await getPreorder(id)
  await prisma.preorderRequest.delete({ where: { id } })
}
