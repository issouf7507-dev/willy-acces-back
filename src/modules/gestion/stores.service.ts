import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateStoreInput, UpdateStoreInput } from './stores.types.js'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Slug unique : suffixe numérique si le nom donne un slug déjà pris. */
async function uniqueSlug(name: string, exceptId?: string): Promise<string> {
  const base = slugify(name) || 'boutique'
  let slug = base
  for (let i = 2; ; i++) {
    const clash = await prisma.store.findUnique({ where: { slug }, select: { id: true } })
    if (!clash || clash.id === exceptId) return slug
    slug = `${base}-${i}`
  }
}

/**
 * Le drapeau « boutique en ligne par défaut » désigne le point de vente qui
 * reçoit les commandes du site. Deux boutiques le portant en même temps
 * rendraient le rattachement indéterminé : on le retire donc partout ailleurs.
 */
async function clearOtherDefaults(keepId?: string) {
  await prisma.store.updateMany({
    where: { isDefaultOnline: true, ...(keepId ? { NOT: { id: keepId } } : {}) },
    data: { isDefaultOnline: false },
  })
}

export async function listStores(includeInactive = false) {
  return prisma.store.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { _count: { select: { staff: true, orders: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function getStore(id: string) {
  const store = await prisma.store.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, name: true, role: true, isActive: true } },
      _count: { select: { orders: true } },
    },
  })
  if (!store) throw new AppError('Boutique introuvable', 404)
  return store
}

/** Boutique recevant les commandes du site. */
export async function getDefaultOnlineStore() {
  return prisma.store.findFirst({ where: { isDefaultOnline: true } })
}

export async function createStore(input: CreateStoreInput) {
  const slug = await uniqueSlug(input.name)
  if (input.isDefaultOnline) await clearOtherDefaults()
  return prisma.store.create({ data: { ...input, slug } })
}

export async function updateStore(id: string, input: UpdateStoreInput) {
  const store = await getStore(id)

  // Le drapeau se déplace, il ne se retire pas : sans boutique en ligne par
  // défaut, les commandes du site n'auraient plus de point de vente et
  // sortiraient des recettes. Pour le déplacer, on le pose sur une autre.
  if (store.isDefaultOnline && input.isDefaultOnline === false) {
    throw new AppError(
      'Désignez d’abord une autre boutique en ligne par défaut : les commandes du site doivent toujours en avoir une.',
      409,
    )
  }
  if (store.isDefaultOnline && input.isActive === false) {
    throw new AppError(
      '« ' + store.name + ' » reçoit les commandes du site : désignez une autre boutique en ligne avant de la désactiver.',
      409,
    )
  }

  const slug = input.name ? await uniqueSlug(input.name, id) : undefined
  if (input.isDefaultOnline) await clearOtherDefaults(id)
  return prisma.store.update({ where: { id }, data: { ...input, ...(slug ? { slug } : {}) } })
}

/**
 * Une boutique qui a vendu ne se supprime pas : ses commandes perdraient leur
 * rattachement et fausseraient rétroactivement recettes et comparatifs. On la
 * désactive, elle sort des listes sans effacer l'historique.
 */
export async function deleteStore(id: string) {
  const store = await getStore(id)
  if (store.isDefaultOnline) {
    throw new AppError(
      '« ' + store.name + ' » reçoit les commandes du site : désignez une autre boutique en ligne avant de la supprimer.',
      409,
    )
  }
  if (store._count.orders > 0) {
    throw new AppError(
      `« ${store.name} » porte ${store._count.orders} vente(s) : désactivez-la au lieu de la supprimer.`,
      409,
    )
  }
  await prisma.store.delete({ where: { id } })
}
