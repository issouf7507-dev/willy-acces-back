import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { CreateSubscriberInput, SubscriberQuery } from './subscribers.types.js'

/** Numéro réduit à ses chiffres : « 07 01 02 03 04 » et « 0701020304 » sont le même inscrit. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Inscription à la communauté. Un numéro déjà inscrit met sa fiche à jour au
 * lieu de lever une erreur : côté boutique, se réinscrire doit se comporter
 * comme une confirmation, pas comme un échec.
 */
export async function createSubscriber(input: CreateSubscriberInput) {
  const phone = normalizePhone(input.phone)
  if (phone.length < 8) throw new AppError('Numéro de téléphone invalide', 400)

  const data = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email?.trim() || null,
  }

  return prisma.subscriber.upsert({
    where: { phone },
    create: { ...data, phone },
    update: data,
  })
}

export async function listSubscribers(query: SubscriberQuery) {
  const { page, limit, search } = query

  const where: Prisma.SubscriberWhereInput = search
    ? {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { phone: { contains: normalizePhone(search) || search } },
          { email: { contains: search } },
        ],
      }
    : {}

  const [total, items] = await prisma.$transaction([
    prisma.subscriber.count({ where }),
    prisma.subscriber.findMany({
      where,
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

export async function deleteSubscriber(id: string) {
  const subscriber = await prisma.subscriber.findUnique({ where: { id } })
  if (!subscriber) throw new AppError('Inscrit introuvable', 404)
  await prisma.subscriber.delete({ where: { id } })
}
