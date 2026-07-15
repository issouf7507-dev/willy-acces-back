import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import { STAFF_ROLES, type CreateUserInput, type UpdateUserInput, type UserQuery } from './users.types.js'

/** Champs renvoyés au client : jamais le hash du mot de passe. */
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
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

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new AppError('Email déjà utilisé', 409)

  const password = await bcrypt.hash(input.password, 12)
  return prisma.user.create({
    data: { ...input, password },
    select: SAFE_SELECT,
  })
}

/**
 * `actorId` = l'ADMIN qui effectue l'action. Il sert aux garde-fous qui
 * empêchent de se verrouiller hors du back-office (se rétrograder, se
 * désactiver) ou de supprimer le dernier ADMIN de la boutique.
 */
export async function updateUser(id: string, input: UpdateUserInput, actorId: string) {
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
  if (!target) throw new AppError('Utilisateur introuvable', 404)

  if (input.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
    if (clash && clash.id !== id) throw new AppError('Email déjà utilisé', 409)
  }

  if (id === actorId) {
    if (input.role && input.role !== target.role) {
      throw new AppError('Vous ne pouvez pas modifier votre propre rôle', 400)
    }
    if (input.isActive === false) {
      throw new AppError('Vous ne pouvez pas désactiver votre propre compte', 400)
    }
  }

  // Retirer le dernier ADMIN actif fermerait définitivement le back-office.
  const losesAdmin =
    target.role === 'ADMIN' && ((input.role && input.role !== 'ADMIN') || input.isActive === false)
  if (losesAdmin) await assertNotLastActiveAdmin(id)

  const data: Record<string, unknown> = { ...input }
  if (input.password) data.password = await bcrypt.hash(input.password, 12)

  return prisma.user.update({ where: { id }, data, select: SAFE_SELECT })
}

export async function deleteUser(id: string, actorId: string) {
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
  if (!target) throw new AppError('Utilisateur introuvable', 404)
  if (id === actorId) throw new AppError('Vous ne pouvez pas supprimer votre propre compte', 400)
  if (target.role === 'ADMIN') await assertNotLastActiveAdmin(id)

  // Les sessions ouvertes doivent tomber avec le compte.
  await prisma.session.deleteMany({ where: { userId: id } })
  await prisma.user.delete({ where: { id } })
}

async function assertNotLastActiveAdmin(excludeId: string) {
  const others = await prisma.user.count({
    where: { role: 'ADMIN', isActive: true, id: { not: excludeId } },
  })
  if (others === 0) {
    throw new AppError('Impossible : c’est le dernier administrateur actif', 400)
  }
}
