import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'

export const CreateReviewSchema = z.object({
  productId: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().optional(),
})

/** Avis déposé depuis la boutique, sans compte : le nom est saisi par le visiteur. */
export const CreatePublicReviewSchema = z.object({
  productId: z.string(),
  rating: z.number().int().min(1).max(5),
  authorName: z.string().trim().min(2).max(60),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(2000).optional(),
})

/**
 * Avis publics d'un produit : approuvés uniquement, et sans exposer l'identité
 * complète de l'auteur (même règle que les témoignages de la page d'accueil —
 * la route est publique).
 */
export async function listProductReviews(productId: string) {
  const reviews = await prisma.review.findMany({
    where: { productId, isApproved: true },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    author: abbreviateName(r.user?.name ?? r.authorName ?? 'Client'),
    createdAt: r.createdAt,
  }))
}

export async function createReview(input: z.infer<typeof CreateReviewSchema>, userId: string) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } })
  if (!product) throw new AppError('Produit introuvable', 404)

  return prisma.review.create({
    data: { ...input, userId },
    include: { user: { select: { id: true, name: true } } },
  })
}

/**
 * Avis public : toujours créé en attente de modération (`isApproved` false par
 * défaut), donc invisible sur la boutique avant validation d'un admin.
 * On ne renvoie que l'id : rien à afficher tant que ce n'est pas approuvé.
 */
export async function createPublicReview(
  input: z.infer<typeof CreatePublicReviewSchema>,
) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  })
  if (!product) throw new AppError('Produit introuvable', 404)

  const review = await prisma.review.create({
    data: {
      productId: input.productId,
      rating: input.rating,
      authorName: input.authorName,
      title: input.title || null,
      body: input.body || null,
    },
    select: { id: true },
  })

  return { id: review.id, pending: true }
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

/**
 * Avis mis en avant sur la vitrine (témoignages page d'accueil).
 * Public : uniquement les avis approuvés et élogieux (4★ et +), avec le prénom
 * de l'auteur et le produit concerné — jamais l'e-mail ni l'id utilisateur.
 */
export async function listFeaturedReviews(limit: number) {
  const reviews = await prisma.review.findMany({
    where: { isApproved: true, rating: { gte: 4 }, body: { not: null } },
    include: {
      user: { select: { name: true } },
      product: { select: { name: true, slug: true } },
    },
    orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })

  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    // « Aïcha Koné » → « Aïcha K. » : on n'expose pas le nom complet.
    author: abbreviateName(r.user?.name ?? r.authorName ?? 'Client'),
    productName: r.product.name,
    productSlug: r.product.slug,
    createdAt: r.createdAt,
  }))
}

/** « Aïcha Koné » → « Aïcha K. ». Un prénom seul est renvoyé tel quel. */
function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name.trim()
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`
}

/** File de modération (admin) : nom complet affiché, ici c'est légitime. */
export async function listPendingReviews() {
  const reviews = await prisma.review.findMany({
    where: { isApproved: false },
    include: { user: { select: { name: true } }, product: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    author: r.user?.name ?? r.authorName ?? 'Client',
    /** Distingue un avis de client connecté d'un avis déposé sans compte. */
    fromAccount: r.userId !== null,
    productName: r.product.name,
    createdAt: r.createdAt,
  }))
}
