import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateProductInput, UpdateProductInput, ProductQuery } from './products.types.js'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function ensureUniqueSlug(slug: string, excludeId?: string): Promise<string> {
  let candidate = slug
  let i = 0
  while (true) {
    const existing = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing || existing.id === excludeId) return candidate
    candidate = `${slug}-${++i}`
  }
}

/**
 * Préfixe SKU à partir d'un libellé : « Accessoires » → ACC, « Lumière » → LUM.
 * Complété par des X si le libellé fait moins de 3 caractères alphanumériques.
 */
function skuPrefix(label: string): string {
  const letters = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return (letters.slice(0, 3) || 'PRD').padEnd(3, 'X')
}

/**
 * Génère le prochain SKU libre pour la catégorie du produit (ACC-001, ACC-002…).
 * Le numéro repart du plus grand existant sur le même préfixe : supprimer un
 * produit ne fait donc pas réutiliser son SKU, ce qui éviterait de retrouver
 * deux références identiques dans d'anciennes commandes.
 */
async function generateSku(categoryId?: string | null, name?: string): Promise<string> {
  let prefix = 'PRD'
  if (categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { name: true },
    })
    if (category) prefix = skuPrefix(category.name)
  } else if (name) {
    prefix = skuPrefix(name)
  }

  // On lit tous les SKU du préfixe pour calculer le max numériquement : un tri
  // SQL sur la chaîne placerait ACC-1000 avant ACC-999.
  const existing = await prisma.product.findMany({
    where: { sku: { startsWith: `${prefix}-` } },
    select: { sku: true },
  })
  const max = existing.reduce((acc, { sku }) => {
    const n = Number(/-(\d+)$/.exec(sku ?? '')?.[1])
    return Number.isFinite(n) && n > acc ? n : acc
  }, 0)

  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

const productSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  shortDescription: true,
  price: true,
  compareAtPrice: true,
  sku: true,
  stock: true,
  isActive: true,
  isFeatured: true,
  isNew: true,
  isPreorder: true,
  releaseDate: true,
  currency: true,
  metadata: true,
  trackInventory: true,
  lowStockAlert: true,
  tags: true,
  seoTitle: true,
  seoDescription: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: { orderBy: { isDefault: 'desc' as const } },
  _count: { select: { reviews: true } },
} satisfies Prisma.ProductSelect

/**
 * Note moyenne et nombre d'avis, calculés sur les avis **approuvés** seulement.
 * `_count.reviews` compte aussi les avis en attente de modération : s'en servir
 * afficherait « (3) » à côté de 0 étoile tant que rien n'est approuvé.
 * Une seule requête agrégée pour toute la page de produits.
 */
async function ratingsFor(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, { rating: number; reviewCount: number }>()

  const rows = await prisma.review.groupBy({
    by: ['productId'],
    where: { isApproved: true, productId: { in: productIds } },
    _avg: { rating: true },
    _count: { rating: true },
  })

  return new Map(
    rows.map((r) => [
      r.productId,
      {
        // Arrondi au dixième : « 4.3 », pas « 4.333333 ».
        rating: Math.round((r._avg.rating ?? 0) * 10) / 10,
        reviewCount: r._count.rating,
      },
    ]),
  )
}

/** Ajoute `rating` / `reviewCount` à chaque produit renvoyé au client. */
async function withRatings<T extends { id: string }>(products: T[]) {
  const ratings = await ratingsFor(products.map((p) => p.id))
  return products.map((p) => ({
    ...p,
    rating: ratings.get(p.id)?.rating ?? 0,
    reviewCount: ratings.get(p.id)?.reviewCount ?? 0,
  }))
}

export async function listProducts(query: ProductQuery) {
  const { page, limit, search, categoryId, isActive, isFeatured, isNew, isPreorder, minPrice, maxPrice, sortBy, sortOrder } = query

  const where: Prisma.ProductWhereInput = {
    ...(search && {
      OR: [
        { name: { contains: search } },
        { description: { contains: search } },
        { sku: { contains: search } },
      ],
    }),
    ...(categoryId && { categoryId }),
    ...(isActive !== undefined && { isActive: isActive === 'true' }),
    ...(isFeatured !== undefined && { isFeatured: isFeatured === 'true' }),
    ...(isNew !== undefined && { isNew: isNew === 'true' }),
    ...(isPreorder !== undefined && { isPreorder: isPreorder === 'true' }),
    ...(minPrice !== undefined || maxPrice !== undefined
      ? { price: { gte: minPrice, lte: maxPrice } }
      : {}),
  }

  const [total, items] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return {
    items: await withRatings(items),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}

export async function getProduct(idOrSlug: string) {
  const product = await prisma.product.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: {
      ...productSelect,
      costPrice: true,
      barcode: true,
      weight: true,
      seoKeywords: true,
    },
  })
  if (!product) throw new AppError('Produit introuvable', 404)
  const [decorated] = await withRatings([product])
  return decorated!
}

export async function createProduct(input: CreateProductInput) {
  const slug = await ensureUniqueSlug(input.slug ?? slugify(input.name))

  const { images, variants, ...data } = input

  // SKU laissé vide côté back-office → on le génère depuis la catégorie.
  const providedSku = data.sku?.trim() || undefined
  const autoSku = !providedSku

  // Deux créations simultanées peuvent viser le même numéro : on retente avec le
  // suivant plutôt que de renvoyer une erreur à l'admin.
  for (let attempt = 0; ; attempt++) {
    const sku = providedSku ?? (await generateSku(data.categoryId, data.name))
    try {
      return await prisma.product.create({
        data: {
          ...data,
          slug,
          sku,
          price: data.price,
          compareAtPrice: data.compareAtPrice,
          costPrice: data.costPrice,
          images: { create: images },
          variants: {
            create: variants.map((v) => ({
              ...v,
              price: v.price,
              compareAtPrice: v.compareAtPrice,
              options: v.options as Record<string, string>,
            })),
          },
        },
        select: productSelect,
      })
    } catch (err) {
      const isSkuConflict =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target ?? '').includes('sku')

      if (isSkuConflict && !autoSku) {
        throw new AppError(`Le SKU « ${sku} » est déjà utilisé par un autre produit`, 409)
      }
      if (isSkuConflict && attempt < 4) continue
      throw err
    }
  }
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const current = await getProduct(id)

  const { images, variants, slug, ...data } = input

  const resolvedSlug = slug ? await ensureUniqueSlug(slugify(slug), id) : undefined

  // Rattrapage pour les produits créés sans SKU : on en génère un au premier
  // enregistrement, sans jamais écraser un SKU déjà renseigné.
  const resolvedSku =
    !current.sku && !data.sku?.trim()
      ? await generateSku(data.categoryId ?? current.category?.id, data.name ?? current.name)
      : undefined

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...data,
      ...(resolvedSlug && { slug: resolvedSlug }),
      ...(resolvedSku && { sku: resolvedSku }),
      ...(images && {
        images: {
          deleteMany: {},
          create: images,
        },
      }),
    },
    select: productSelect,
  })

  return product
}

export async function deleteProduct(id: string) {
  await getProduct(id)
  await prisma.product.delete({ where: { id } })
}

export async function updateStock(productId: string, quantity: number, note?: string) {
  await prisma.product.findUniqueOrThrow({ where: { id: productId } })

  const [updated] = await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
      select: { id: true, name: true, stock: true },
    }),
    prisma.inventory.create({
      data: {
        productId,
        quantity,
        type: quantity >= 0 ? 'RESTOCK' : 'ADJUSTMENT',
        note,
      },
    }),
  ])

  return updated
}

export async function getFeatured(limit = 8) {
  return withRatings(await prisma.product.findMany({
    where: { isActive: true, isFeatured: true },
    select: productSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  }))
}

export async function getNewArrivals(limit = 12) {
  return withRatings(await prisma.product.findMany({
    where: { isActive: true, isNew: true },
    select: productSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  }))
}

export async function getPreorders(limit = 12) {
  return withRatings(await prisma.product.findMany({
    where: { isActive: true, isPreorder: true },
    select: productSelect,
    // Les sorties les plus proches d'abord ; releaseDate nulle en dernier
    orderBy: [{ releaseDate: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  }))
}
