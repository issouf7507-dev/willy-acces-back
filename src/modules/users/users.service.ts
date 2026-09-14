import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import { STAFF_ROLES, type CreateUserInput, type UpdateUserInput, type UserQuery } from './users.types.js'

/** La personne connectée qui effectue l'action. */
interface Actor {
  userId: string
  role: string
}

/** Champs renvoyés au client : jamais le hash du mot de passe. */
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  storeId: true,
  store: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const

export async function listUsers(query: UserQuery) {
  return prisma.user.findMany({
    where: {
      ...(query.scope === 'staff' ? { role: { in: [...STAFF_ROLES] } } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
    },
    select: SAFE_SELECT,
    orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
  })
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: SAFE_SELECT })
  if (!user) throw new AppError('Utilisateur introuvable', 404)
  return user
}

/**
 * Seul un SUPER_ADMIN fabrique un SUPER_ADMIN. Sans cette barrière, un ADMIN
 * se donnerait par un simple POST les écrans d'argent qu'on vient de lui
 * retirer — ou s'y donnerait accès via un compte complice.
 */
function assertMayGrant(role: string | undefined, actor: Actor) {
  if (role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    throw new AppError('Seul un super administrateur peut accorder ce rôle', 403)
  }
}

/** Un compte de super administrateur ne se modifie que depuis ce même niveau. */
function assertMayTouch(targetRole: string, actor: Actor) {
  if (targetRole === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    throw new AppError('Seul un super administrateur peut modifier ce compte', 403)
  }
}

export async function createUser(input: CreateUserInput, actor: Actor) {
  assertMayGrant(input.role, actor)

  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new AppError('Email déjà utilisé', 409)

  const password = await bcrypt.hash(input.password, 12)
  return prisma.user.create({
    data: { ...input, password },
    select: SAFE_SELECT,
  })
}

/**
 * `actor` = la personne qui effectue l'action. Elle sert aux garde-fous qui
 * empêchent de se verrouiller hors du back-office (se rétrograder, se
 * désactiver), de retirer le dernier super administrateur, ou de se hisser
 * soi-même au-dessus de son rôle.
 */
export async function updateUser(id: string, input: UpdateUserInput, actor: Actor) {
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
  if (!target) throw new AppError('Utilisateur introuvable', 404)

  assertMayTouch(target.role, actor)
  assertMayGrant(input.role, actor)

  if (input.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
    if (clash && clash.id !== id) throw new AppError('Email déjà utilisé', 409)
  }

  if (id === actor.userId) {
    if (input.role && input.role !== target.role) {
      throw new AppError('Vous ne pouvez pas modifier votre propre rôle', 400)
    }
    if (input.isActive === false) {
      throw new AppError('Vous ne pouvez pas désactiver votre propre compte', 400)
    }
  }

  // Retirer le dernier SUPER_ADMIN actif fermerait définitivement le sommet du
  // back-office : plus personne ne pourrait clôturer un mois ni nommer un pair.
  const losesSuperAdmin =
    target.role === 'SUPER_ADMIN' &&
    ((input.role && input.role !== 'SUPER_ADMIN') || input.isActive === false)
  if (losesSuperAdmin) await assertNotLastActiveSuperAdmin(id)

  const data: Record<string, unknown> = { ...input }
  if (input.password) data.password = await bcrypt.hash(input.password, 12)

  return prisma.user.update({ where: { id }, data, select: SAFE_SELECT })
}

export async function deleteUser(id: string, actor: Actor) {
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
  if (!target) throw new AppError('Utilisateur introuvable', 404)
  if (id === actor.userId) throw new AppError('Vous ne pouvez pas supprimer votre propre compte', 400)
  assertMayTouch(target.role, actor)
  if (target.role === 'SUPER_ADMIN') await assertNotLastActiveSuperAdmin(id)

  // Les sessions ouvertes doivent tomber avec le compte.
  await prisma.session.deleteMany({ where: { userId: id } })
  await prisma.user.delete({ where: { id } })
}

async function assertNotLastActiveSuperAdmin(excludeId: string) {
  const others = await prisma.user.count({
    where: { role: 'SUPER_ADMIN', isActive: true, id: { not: excludeId } },
  })
  if (others === 0) {
    throw new AppError('Impossible : c’est le dernier super administrateur actif', 400)
  }
}
