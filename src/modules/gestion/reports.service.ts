import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { getBalance } from './finance.service.js'
import { PAID_ORDER, PAID_ORDER_ITEM } from '../../lib/paid-orders.js'

const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v)

const monthBounds = (month: string): [Date, Date] => {
  const [y, m] = month.split('-').map(Number)
  return [new Date(y, m - 1, 1), new Date(y, m, 1)]
}

// ─── Stock, marges et suggestions ────────────────────────────────────────────

export interface StockRow {
  productId: string
  name: string
  sku: string | null
  received: number
  sold: number
  stock: number
  /** Reçu − vendu. Doit égaler `stock` ; l'écart signale un stock non suivi. */
  theoreticalStock: number
  costPrice: number | null
  avgSalePrice: number | null
  unitMargin: number | null
  totalMargin: number | null
  sold30: number
  lowStockAlert: number
  needsRestock: boolean
  suggestPromo: boolean
  /** Répartition du stock : `{ [storeId]: quantité }`, boutiques à zéro omises. */
  byStore: Record<string, number>
}

export interface StockReport {
  stores: { id: string; name: string }[]
  rows: StockRow[]
}

/**
 * Remplace l'onglet « Stock » du classeur : reçu, vendu, restant, marge et
 * alertes, sans rien stocker.
 *
 * Différence assumée avec le fichier Excel : la marge part du coût de revient
 * (`Product.costPrice`, transport et douane inclus, écrit à la réception des
 * arrivages) et non du seul prix d'achat. Les marges sont donc plus basses —
 * et justes.
 */
export async function stockReport(): Promise<StockReport> {
  const since30 = new Date()
  since30.setDate(since30.getDate() - 30)

  const [stores, storeStocks, products, received, sold, sold30] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.storeStock.findMany({
      where: { quantity: { not: 0 } },
      select: { productId: true, storeId: true, quantity: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, stock: true, costPrice: true, lowStockAlert: true },
      orderBy: { name: 'asc' },
    }),
    // Reçu = livraisons réceptionnées, y compris celles d'un arrivage partiel.
    prisma.shipmentGroupItem.findMany({
      where: { group: { status: 'RECEIVED' } },
      select: { quantity: true, shipmentItem: { select: { productId: true } } },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: PAID_ORDER_ITEM,
      _sum: { quantity: true, total: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { ...PAID_ORDER, createdAt: { gte: since30 } } },
      _sum: { quantity: true },
    }),
  ])

  const receivedBy = new Map<string, number>()
  for (const r of received) {
    const productId = r.shipmentItem.productId
    receivedBy.set(productId, (receivedBy.get(productId) ?? 0) + r.quantity)
  }
  const soldBy = new Map(
    sold.map((r) => [r.productId, { qty: r._sum.quantity ?? 0, revenue: num(r._sum.total) }]),
  )
  const sold30By = new Map(sold30.map((r) => [r.productId, r._sum.quantity ?? 0]))

  const stockByProduct = new Map<string, Record<string, number>>()
  for (const row of storeStocks) {
    const entry = stockByProduct.get(row.productId) ?? {}
    entry[row.storeId] = row.quantity
    stockByProduct.set(row.productId, entry)
  }

  const rows = products.map((p) => {
    const receivedQty = receivedBy.get(p.id) ?? 0
    const s = soldBy.get(p.id) ?? { qty: 0, revenue: 0 }
    const cost = p.costPrice === null ? null : num(p.costPrice)
    // Prix de vente réellement encaissé, remises comprises.
    const avgSalePrice = s.qty > 0 ? s.revenue / s.qty : null
    const unitMargin = cost !== null && avgSalePrice !== null ? avgSalePrice - cost : null
    const recent = sold30By.get(p.id) ?? 0

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      received: receivedQty,
      sold: s.qty,
      stock: p.stock,
      theoreticalStock: receivedQty - s.qty,
      costPrice: cost,
      avgSalePrice,
      unitMargin,
      totalMargin: unitMargin !== null ? unitMargin * s.qty : null,
      sold30: recent,
      lowStockAlert: p.lowStockAlert,
      needsRestock: p.stock <= p.lowStockAlert,
      // Règle du classeur : beaucoup de stock, peu de ventes récentes.
      suggestPromo: p.stock >= p.lowStockAlert * 2 && recent <= 2,
      byStore: stockByProduct.get(p.id) ?? {},
    }
  })

  return { stores, rows }
}

// ─── Fidélité client ─────────────────────────────────────────────────────────

export interface CustomerRow {
  /** Identifiant de la fiche de comptoir, absent pour un client à compte. */
  customerId: string | null
  userId: string | null
  name: string
  phone: string | null
  visits: number
  totalSpent: number
  totalDiscount: number
  lastVisit: string | null
}

/**
 * Réunit les deux façons d'être client : la fiche de comptoir (`Customer`) et
 * le compte du site (`User`). Une commande sans ni l'un ni l'autre — vente de
 * passage — reste hors de ce tableau, faute de quelqu'un à qui la rattacher.
 */
export async function customersReport(): Promise<CustomerRow[]> {
  const orders = await prisma.order.findMany({
    where: { ...PAID_ORDER, OR: [{ customerId: { not: null } }, { userId: { not: null } }] },
    select: {
      customerId: true,
      userId: true,
      total: true,
      discountAmount: true,
      createdAt: true,
      customer: { select: { id: true, name: true, phone: true } },
      user: { select: { id: true, name: true, phone: true } },
    },
  })

  const rows = new Map<string, CustomerRow>()
  for (const o of orders) {
    // La fiche de comptoir prime : c'est elle que le back-office édite.
    const identity = o.customer
      ? { key: `customer:${o.customer.id}`, customerId: o.customer.id, userId: null, name: o.customer.name, phone: o.customer.phone }
      : { key: `user:${o.user!.id}`, customerId: null, userId: o.user!.id, name: o.user!.name, phone: o.user!.phone }

    const row = rows.get(identity.key) ?? {
      customerId: identity.customerId,
      userId: identity.userId,
      name: identity.name,
      phone: identity.phone,
      visits: 0,
      totalSpent: 0,
      totalDiscount: 0,
      lastVisit: null,
    }
    row.visits += 1
    row.totalSpent += num(o.total)
    row.totalDiscount += num(o.discountAmount)
    const day = o.createdAt.toISOString()
    if (!row.lastVisit || day > row.lastVisit) row.lastVisit = day
    rows.set(identity.key, row)
  }

  return [...rows.values()].sort((a, b) => b.totalSpent - a.totalSpent)
}

// ─── Vendeuses ───────────────────────────────────────────────────────────────

export interface SellerRow {
  sellerId: string
  name: string
  storeName: string | null
  sales: number
  totalSold: number
  averageBasket: number
}

/** Ventes et panier moyen par vendeuse, sur les ventes qui portent son nom. */
export async function sellersReport(month?: string): Promise<SellerRow[]> {
  const [from, to] = month ? monthBounds(month) : [undefined, undefined]

  const orders = await prisma.order.findMany({
    where: {
      sellerId: { not: null },
      ...PAID_ORDER,
      ...(from && to ? { createdAt: { gte: from, lt: to } } : {}),
    },
    select: {
      sellerId: true,
      total: true,
      seller: { select: { id: true, name: true, store: { select: { name: true } } } },
    },
  })

  const rows = new Map<string, SellerRow>()
  for (const o of orders) {
    const seller = o.seller!
    const row = rows.get(seller.id) ?? {
      sellerId: seller.id,
      name: seller.name,
      storeName: seller.store?.name ?? null,
      sales: 0,
      totalSold: 0,
      averageBasket: 0,
    }
    row.sales += 1
    row.totalSold += num(o.total)
    rows.set(seller.id, row)
  }

  return [...rows.values()]
    .map((r) => ({ ...r, averageBasket: r.sales > 0 ? r.totalSold / r.sales : 0 }))
    .sort((a, b) => b.totalSold - a.totalSold)
}

// ─── Historique des prix ─────────────────────────────────────────────────────

export interface PriceChangeRow {
  id: string
  productId: string
  productName: string
  oldPrice: number
  newPrice: number
  delta: number
  /** Variation relative ; `null` si l'ancien prix était nul. */
  ratio: number | null
  changedBy: string | null
  createdAt: string
}

/** Derniers changements de prix de vente, du plus récent au plus ancien. */
export async function priceHistory(limit = 50): Promise<PriceChangeRow[]> {
  const rows = await prisma.priceHistory.findMany({
    include: {
      product: { select: { id: true, name: true } },
      changedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map((r) => {
    const oldPrice = num(r.oldPrice)
    const newPrice = num(r.newPrice)
    return {
      id: r.id,
      productId: r.product.id,
      productName: r.product.name,
      oldPrice,
      newPrice,
      delta: newPrice - oldPrice,
      ratio: oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : null,
      changedBy: r.changedBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    }
  })
}

// ─── Tableau de bord ─────────────────────────────────────────────────────────

export interface DashboardData {
  today: number
  month: string
  monthRevenue: number
  /** `null` tant que les charges du mois ne sont pas saisies. */
  netProfit: number | null
  monthClosed: boolean
  restockCount: number
  promoCount: number
  byStore: { storeId: string; name: string; revenue: number }[]
  bestStore: string | null
  /** Six derniers mois, pour le comparatif entre boutiques. */
  monthly: { month: string; byStore: Record<string, number> }[]
}

const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * Assemble les indicateurs du classeur en une seule lecture : recette du jour
 * et du mois, bénéfice net, alertes, recette par boutique et comparatif.
 *
 * Tout est recalculé à la demande — aucun de ces chiffres n'est stocké, donc
 * une vente enregistrée après coup les corrige d'elle-même.
 */
export async function dashboard(): Promise<DashboardData> {
  const now = new Date()
  const month = monthKeyOf(now)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  // Six mois glissants, mois courant inclus.
  const startOfWindow = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [stores, orders, stock, balance] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.order.findMany({
      where: { ...PAID_ORDER, createdAt: { gte: startOfWindow } },
      select: { createdAt: true, storeId: true, total: true },
    }),
    stockReport(),
    getBalance(month),
  ])

  let today = 0
  let monthRevenue = 0
  const revenueByStore = new Map<string, number>()
  const monthlyByStore = new Map<string, Record<string, number>>()

  for (const o of orders) {
    const total = num(o.total)
    const key = monthKeyOf(o.createdAt)
    const row = monthlyByStore.get(key) ?? {}
    if (o.storeId) row[o.storeId] = (row[o.storeId] ?? 0) + total
    monthlyByStore.set(key, row)

    if (o.createdAt >= startOfMonth) {
      monthRevenue += total
      if (o.storeId) revenueByStore.set(o.storeId, (revenueByStore.get(o.storeId) ?? 0) + total)
    }
    if (o.createdAt >= startOfToday) today += total
  }

  const byStore = stores.map((s) => ({
    storeId: s.id,
    name: s.name,
    revenue: revenueByStore.get(s.id) ?? 0,
  }))
  const best = byStore.reduce<{ name: string; revenue: number } | null>(
    (acc, s) => (s.revenue > 0 && (!acc || s.revenue > acc.revenue) ? s : acc),
    null,
  )

  // Les six mois sont énumérés explicitement : un mois sans vente doit
  // apparaître à zéro sur le graphique, pas disparaître de l'axe.
  const monthly: DashboardData['monthly'] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKeyOf(d)
    monthly.push({ month: key, byStore: monthlyByStore.get(key) ?? {} })
  }

  return {
    today,
    month,
    monthRevenue,
    // Sans charges saisies, le « bénéfice net » ne serait que la recette moins
    // les imprévus : mieux vaut ne rien annoncer que d'annoncer un chiffre faux.
    netProfit: balance.closed ? balance.netProfit : null,
    monthClosed: balance.closed,
    restockCount: stock.rows.filter((r) => r.needsRestock).length,
    promoCount: stock.rows.filter((r) => r.suggestPromo).length,
    byStore,
    bestStore: best?.name ?? null,
    monthly,
  }
}
