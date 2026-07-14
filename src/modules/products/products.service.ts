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
    items,
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
  return product
}

export async function createProduct(input: CreateProductInput) {
  const slug = await ensureUniqueSlug(input.slug ?? slugify(input.name))

  const { images, variants, ...data } = input

  const product = await prisma.product.create({
    data: {
      ...data,
      slug,
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

  return product
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  await getProduct(id)

  const { images, variants, slug, ...data } = input

  const resolvedSlug = slug ? await ensureUniqueSlug(slugify(slug), id) : undefined

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...data,
      ...(resolvedSlug && { slug: resolvedSlug }),
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
  return prisma.product.findMany({
    where: { isActive: true, isFeatured: true },
    select: productSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function getNewArrivals(limit = 12) {
  return prisma.product.findMany({
    where: { isActive: true, isNew: true },
    select: productSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function getPreorders(limit = 12) {
  return prisma.product.findMany({
    where: { isActive: true, isPreorder: true },
    select: productSelect,
    // Les sorties les plus proches d'abord ; releaseDate nulle en dernier
    orderBy: [{ releaseDate: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  })
}
