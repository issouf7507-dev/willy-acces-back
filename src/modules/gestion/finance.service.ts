import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middlewares/errors.js'
import { PAID_ORDER } from '../../lib/paid-orders.js'
import { resolveStoreScope } from '../../lib/store-scope.js'
import type {
  CreateExpenseInput,
  ExpenseQuery,
  UpdateExpenseInput,
  UpsertClosingInput,
} from './finance.types.js'

const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v)

/** Bornes `[début, fin[` d'un mois `YYYY-MM`, en heure locale. */
function monthBounds(month: string): [Date, Date] {
  const [y, m] = month.split('-').map(Number)
  return [new Date(y, m - 1, 1), new Date(y, m, 1)]
}

const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** La personne connectée qui effectue l'action. */
interface Actor {
  userId: string
  role: string
}

/** Jour courant `YYYY-MM-DD`, en heure locale comme le reste du module. */
const todayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ─── Dépenses annexes ────────────────────────────────────────────────────────

export async function listExpenses(query: ExpenseQuery, actor: Actor) {
  const storeId = await resolveStoreScope(
    actor,
    query.storeId,
    'Vous ne pouvez consulter que les dépenses de votre boutique.',
  )

  // La vendeuse ne lit que la journée en cours : le cumul du mois dit ce que la
  // boutique dépense, un chiffre qui relève du bureau.
  const day = actor.role === 'VENDEUR' ? todayKey() : null
  const [from, to] = day
    ? [new Date(`${day}T00:00:00`), new Date(`${day}T23:59:59.999`)]
    : query.month
      ? monthBounds(query.month)
      : [
          query.from ? new Date(`${query.from}T00:00:00`) : undefined,
          query.to ? new Date(`${query.to}T23:59:59.999`) : undefined,
        ]

  return prisma.expense.findMany({
    where: {
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...(storeId ? { storeId } : {}),
    },
    include: { store: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  })
}

export async function createExpense(input: CreateExpenseInput, actor: Actor) {
  // Même borne qu'à la caisse : la dépense tombe dans la boutique où l'on
  // travaille, jamais dans celle d'à côté.
  const storeId = await resolveStoreScope(
    actor,
    input.storeId ?? undefined,
    'Vous ne pouvez enregistrer une dépense que dans votre boutique.',
  )

  // Antidater serait un moyen commode de rattraper une caisse qui ne tombe pas
  // juste : la vendeuse note la journée qu'elle est en train de faire.
  if (actor.role === 'VENDEUR' && input.date !== todayKey()) {
    throw new AppError('Vous ne pouvez enregistrer qu’une dépense du jour.', 403)
  }

  return prisma.expense.create({
    data: { ...input, storeId: storeId ?? null, date: new Date(`${input.date}T12:00:00`) },
    include: { store: { select: { id: true, name: true } } },
  })
}

export async function updateExpense(id: string, input: UpdateExpenseInput) {
  const existing = await prisma.expense.findUnique({ where: { id } })
  if (!existing) throw new AppError('Dépense introuvable', 404)

  return prisma.expense.update({
    where: { id },
    data: { ...input, ...(input.date ? { date: new Date(`${input.date}T12:00:00`) } : {}) },
    include: { store: { select: { id: true, name: true } } },
  })
}

export async function deleteExpense(id: string, actor: Actor) {
  const existing = await prisma.expense.findUnique({ where: { id } })
  if (!existing) throw new AppError('Dépense introuvable', 404)

  // Le comptoir efface sa faute de frappe du jour, rien de plus : une dépense
  // d'hier est déjà entrée dans les comptes, et celle d'une autre boutique ne
  // le regarde pas. `resolveStoreScope` renvoie `undefined` à l'administration,
  // qui garde la main sur toutes les lignes.
  const scope = await resolveStoreScope(actor, undefined)
  if (scope) {
    if (existing.storeId !== scope) {
      throw new AppError('Cette dépense n’a pas été enregistrée dans votre boutique.', 403)
    }
    if (todayKey(existing.date) !== todayKey()) {
      throw new AppError('Vous ne pouvez supprimer qu’une dépense du jour.', 403)
    }
  }

  await prisma.expense.delete({ where: { id } })
}

// ─── Bilan mensuel ───────────────────────────────────────────────────────────

export interface MonthlyBalance {
  month: string
  /** Faux quand le mois n'a pas encore de fiche : les charges sont à saisir. */
  closed: boolean
  rent: number
  salaries: number
  utilities: number
  transportTaxes: number
  other: number
  obligatoryTotal: number
  revenue: number
  expensesTotal: number
  netProfit: number
  /** `null` au tout premier mois : aucun mois précédent d'où tirer la réserve. */
  reserve: number | null
  remaining: number
  purchaseRate: number
  purchases: number
  savings: number
  notes: string | null
}

/**
 * Construit le bilan d'un mois à partir des charges saisies et des chiffres
 * calculés. Reprend la mécanique du classeur :
 *
 *   bénéfice net = recettes − charges obligatoires − dépenses annexes
 *   réserve      = charges obligatoires du mois précédent (un mois d'avance)
 *   reste        = bénéfice net − réserve, réparti Achats / Épargne
 *
 * Nuance assumée par rapport au fichier Excel : au premier mois, celui-ci
 * n'affichait ni réserve ni répartition. Ici la réserve vaut `null` — il n'y a
 * pas de mois précédent — mais la répartition est tout de même calculée, sans
 * quoi le premier mois ne dirait rien de ce qu'il y a à placer.
 */
function buildBalance(
  month: string,
  closing: {
    rent: Prisma.Decimal
    salaries: Prisma.Decimal
    utilities: Prisma.Decimal
    transportTaxes: Prisma.Decimal
    other: Prisma.Decimal
    purchaseRate: Prisma.Decimal
    notes: string | null
  } | null,
  revenue: number,
  expensesTotal: number,
  previousObligatory: number | null,
): MonthlyBalance {
  const rent = num(closing?.rent)
  const salaries = num(closing?.salaries)
  const utilities = num(closing?.utilities)
  const transportTaxes = num(closing?.transportTaxes)
  const other = num(closing?.other)
  const obligatoryTotal = rent + salaries + utilities + transportTaxes + other

  const netProfit = revenue - obligatoryTotal - expensesTotal
  const reserve = previousObligatory
  const remaining = netProfit - (reserve ?? 0)
  const purchaseRate = closing ? num(closing.purchaseRate) : 0.65
  // Un mois déficitaire n'a rien à répartir : sans ce plancher, on annoncerait
  // des montants d'achats et d'épargne négatifs.
  const distributable = Math.max(0, remaining)

  return {
    month,
    closed: closing !== null,
    rent, salaries, utilities, transportTaxes, other,
    obligatoryTotal,
    revenue,
    expensesTotal,
    netProfit,
    reserve,
    remaining,
    purchaseRate,
    purchases: distributable * purchaseRate,
    savings: distributable * (1 - purchaseRate),
    notes: closing?.notes ?? null,
  }
}

/**
 * Tous les mois ayant une activité : une fiche de clôture, des ventes, ou des
 * dépenses. Un mois qui a vendu sans être clôturé apparaît donc de lui-même,
 * avec ses charges à zéro et le drapeau `closed: false`.
 */
export async function listBalances(): Promise<MonthlyBalance[]> {
  const [closings, orders, expenses] = await Promise.all([
    prisma.monthlyClosing.findMany(),
    prisma.order.findMany({
      where: PAID_ORDER,
      select: { createdAt: true, total: true },
    }),
    prisma.expense.findMany({ select: { date: true, amount: true } }),
  ])

  const revenueByMonth = new Map<string, number>()
  for (const o of orders) {
    const k = monthKey(o.createdAt)
    revenueByMonth.set(k, (revenueByMonth.get(k) ?? 0) + num(o.total))
  }

  const expensesByMonth = new Map<string, number>()
  for (const e of expenses) {
    const k = monthKey(e.date)
    expensesByMonth.set(k, (expensesByMonth.get(k) ?? 0) + num(e.amount))
  }

  const closingByMonth = new Map(closings.map((c) => [c.month, c]))
  const months = [
    ...new Set([...closingByMonth.keys(), ...revenueByMonth.keys(), ...expensesByMonth.keys()]),
  ].sort()

  // La réserve d'un mois vient du mois précédent : on parcourt en ordre
  // chronologique, puis on renverse pour l'affichage.
  const balances: MonthlyBalance[] = []
  let previousObligatory: number | null = null
  for (const month of months) {
    const balance = buildBalance(
      month,
      closingByMonth.get(month) ?? null,
      revenueByMonth.get(month) ?? 0,
      expensesByMonth.get(month) ?? 0,
      previousObligatory,
    )
    balances.push(balance)
    previousObligatory = balance.obligatoryTotal
  }

  return balances.reverse()
}

export async function getBalance(month: string): Promise<MonthlyBalance> {
  const all = await listBalances()
  const found = all.find((b) => b.month === month)
  if (found) return found

  // Mois sans la moindre activité : bilan vide, mais la réserve reste celle du
  // dernier mois connu qui le précède.
  const previous = all.filter((b) => b.month < month).sort((a, b) => a.month.localeCompare(b.month))
  const previousObligatory = previous.length ? previous[previous.length - 1].obligatoryTotal : null
  return buildBalance(month, null, 0, 0, previousObligatory)
}

export async function upsertClosing(month: string, input: UpsertClosingInput) {
  await prisma.monthlyClosing.upsert({
    where: { month },
    create: { month, ...input },
    update: input,
  })
  return getBalance(month)
}

export async function deleteClosing(month: string) {
  const existing = await prisma.monthlyClosing.findUnique({ where: { month } })
  if (!existing) throw new AppError('Clôture introuvable', 404)
  await prisma.monthlyClosing.delete({ where: { month } })
}
