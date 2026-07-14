import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.types.js'

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
    const existing = await prisma.category.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!existing || existing.id === excludeId) return candidate
    candidate = `${slug}-${++i}`
  }
}

export async function listCategories(includeInactive = false) {
  return prisma.category.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: {
      children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      _count: { select: { products: true } },
    },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function getCategory(idOrSlug: string) {
  const category = await prisma.category.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: true,
      _count: { select: { products: true } },
    },
  })
  if (!category) throw new AppError('Catégorie introuvable', 404)
  return category
}

export async function createCategory(input: CreateCategoryInput) {
  const slug = await ensureUniqueSlug(input.slug ?? slugify(input.name))
  return prisma.category.create({ data: { ...input, slug } })
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  await getCategory(id)
  const slug = input.slug ? await ensureUniqueSlug(slugify(input.slug), id) : undefined
  return prisma.category.update({ where: { id }, data: { ...input, ...(slug && { slug }) } })
}

export async function deleteCategory(id: string) {
  const cat = await getCategory(id)
  if (cat._count.products > 0) {
    throw new AppError('Impossible de supprimer une catégorie avec des produits', 400)
  }
  await prisma.category.delete({ where: { id } })
}
