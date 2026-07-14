import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'

export const CreateReviewSchema = z.object({
  productId: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().optional(),
})

export async function listProductReviews(productId: string) {
  return prisma.review.findMany({
    where: { productId, isApproved: true },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createReview(input: z.infer<typeof CreateReviewSchema>, userId: string) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } })
  if (!product) throw new AppError('Produit introuvable', 404)

  return prisma.review.create({
    data: { ...input, userId },
    include: { user: { select: { id: true, name: true } } },
  })
}

export async function approveReview(id: string) {
  return prisma.review.update({ where: { id }, data: { isApproved: true } })
}

export async function deleteReview(id: string, userId: string, isAdmin: boolean) {
  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) throw new AppError('Avis introuvable', 404)
  if (!isAdmin && review.userId !== userId) throw new AppError('Accès refusé', 403)
  await prisma.review.delete({ where: { id } })
}

export async function listPendingReviews() {
  return prisma.review.findMany({
    where: { isApproved: false },
    include: { user: { select: { name: true } }, product: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}
