import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type {
  CreateCustomerInput,
  CustomerQuery,
  UpdateCustomerInput,
} from './customers.types.js'

export async function listCustomers(query: CustomerQuery) {
  return prisma.customer.findMany({
    where: {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { orders: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  })
  if (!customer) throw new AppError('Client introuvable', 404)
  return customer
}

/**
 * Retrouve un client par téléphone, ou le crée. Le comptoir saisit un nom et un
 * numéro sans savoir si la fiche existe : sans cette résolution, le même client
 * se dédoublerait à chaque passage — exactement ce qui cassait le suivi dans le
 * fichier Excel, où le rapprochement se faisait sur le nom écrit à la main.
 */
export async function findOrCreateByPhone(name: string, phone?: string) {
  if (phone) {
    const existing = await prisma.customer.findUnique({ where: { phone } })
    if (existing) return existing
  }
  return prisma.customer.create({ data: { name, phone } })
}

export async function createCustomer(input: CreateCustomerInput) {
  if (input.phone) {
    const existing = await prisma.customer.findUnique({ where: { phone: input.phone } })
    if (existing) throw new AppError(`Ce numéro est déjà celui de « ${existing.name} »`, 409)
  }
  return prisma.customer.create({ data: input })
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  await getCustomer(id)
  return prisma.customer.update({ where: { id }, data: input })
}

/**
 * Un client qui a acheté n'est pas supprimé : ses ventes perdraient leur
 * rattachement. On le désactive, sa fiche sort des listes du comptoir.
 */
export async function deleteCustomer(id: string) {
  const customer = await getCustomer(id)
  if (customer._count.orders > 0) {
    throw new AppError(
      `« ${customer.name} » a ${customer._count.orders} achat(s) : désactivez la fiche au lieu de la supprimer.`,
      409,
    )
  }
  await prisma.customer.delete({ where: { id } })
}
