import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import type { TargetQuery, UpsertTargetInput } from './targets.types.js'
import { PAID_ORDER } from '../../lib/paid-orders.js'

const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v)

const monthBounds = (month: string): [Date, Date] => {
  const [y, m] = month.split('-').map(Number)
  return [new Date(y, m - 1, 1), new Date(y, m, 1)]
}

const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export interface TargetRow {
  id: string | null
  month: string
  storeId: string
  storeName: string
  target: number
  achieved: number
  /** `null` quand aucun objectif n'est fixé : il n'y a rien à rapporter. */
  rate: number | null
  gap: number | null
}

/**
 * Objectifs et réalisé, mois par mois et boutique par boutique.
 *
 * Chaque boutique active apparaît même sans objectif fixé : sinon une boutique
 * oubliée à la saisie disparaîtrait du suivi alors qu'elle vend.
 */
export async function listTargets(query: TargetQuery): Promise<TargetRow[]> {
  const [targets, stores] = await Promise.all([
    prisma.salesTarget.findMany({
      where: query.month ? { month: query.month } : {},
      include: { store: { select: { id: true, name: true } } },
    }),
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])

  const [from, to] = query.month ? monthBounds(query.month) : [undefined, undefined]
  const orders = await prisma.order.findMany({
    where: {
      ...PAID_ORDER,
      storeId: { not: null },
      ...(from && to ? { createdAt: { gte: from, lt: to } } : {}),
    },
    select: { storeId: true, total: true, createdAt: true },
  })

  const achievedBy = new Map<string, number>()
  for (const o of orders) {
    const key = `${monthKey(o.createdAt)}|${o.storeId}`
    achievedBy.set(key, (achievedBy.get(key) ?? 0) + num(o.total))
  }

  const targetBy = new Map(targets.map((t) => [`${t.month}|${t.storeId}`, t]))

  // Mois à afficher : ceux qui portent un objectif, ceux qui ont vendu, et le
  // mois demandé même s'il est encore vide.
  const months = new Set<string>([
    ...targets.map((t) => t.month),
    ...[...achievedBy.keys()].map((k) => k.split('|')[0]),
  ])
  if (query.month) months.add(query.month)

  const rows: TargetRow[] = []
  for (const month of months) {
    for (const store of stores) {
      const key = `${month}|${store.id}`
      const target = targetBy.get(key)
      const achieved = achievedBy.get(key) ?? 0
      if (!target && achieved === 0) continue

      const amount = target ? num(target.amount) : 0
      rows.push({
        id: target?.id ?? null,
        month,
        storeId: store.id,
        storeName: store.name,
        target: amount,
        achieved,
        rate: amount > 0 ? achieved / amount : null,
        gap: amount > 0 ? achieved - amount : null,
      })
    }
  }

  return rows.sort((a, b) => b.month.localeCompare(a.month) || a.storeName.localeCompare(b.storeName))
}

export async function upsertTarget(input: UpsertTargetInput) {
  const store = await prisma.store.findUnique({ where: { id: input.storeId } })
  if (!store) throw new AppError('Boutique introuvable', 404)

  return prisma.salesTarget.upsert({
    where: { month_storeId: { month: input.month, storeId: input.storeId } },
    create: input,
    update: { amount: input.amount },
    include: { store: { select: { id: true, name: true } } },
  })
}

export async function deleteTarget(id: string) {
  const target = await prisma.salesTarget.findUnique({ where: { id } })
  if (!target) throw new AppError('Objectif introuvable', 404)
  await prisma.salesTarget.delete({ where: { id } })
}
