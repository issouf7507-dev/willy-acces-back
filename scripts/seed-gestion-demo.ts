/**
 * Jeu de démonstration du module Gestion : arrivages, ventes, dépenses,
 * clôtures, objectifs et historique des prix, pour voir tous les écrans peuplés.
 *
 * Il passe par les services réels (réception d'arrivage, encaissement) et non
 * par des écritures directes : ce que l'on voit à l'écran est donc produit par
 * le même code que la saisie manuelle.
 *
 * Réservé au développement. Il ne crée aucun produit — le catalogue de la
 * boutique n'est pas touché — et note tout ce qu'il modifie pour pouvoir le
 * défaire :
 *
 *   pnpm run gestion:demo          # injecte le jeu
 *   pnpm run gestion:demo -- --clear   # l'efface et restaure l'état d'avant
 */
import type { Prisma } from '@prisma/client'
import { config } from 'dotenv'

config()

const { prisma } = await import('../src/lib/prisma.js')
const shipments = await import('../src/modules/gestion/shipments.service.js')
const sales = await import('../src/modules/gestion/sales.service.js')
const finance = await import('../src/modules/gestion/finance.service.js')
const targets = await import('../src/modules/gestion/targets.service.js')

/** Clé du relevé de ce qui a été créé ou modifié, pour un retrait exact. */
const SNAPSHOT_KEY = 'gestion:demo'

interface Snapshot {
  orderIds: string[]
  shipmentIds: string[]
  customerIds: string[]
  expenseIds: string[]
  closingMonths: string[]
  targetIds: string[]
  priceHistoryIds: string[]
  inventoryRefs: string[]
  products: { id: string; stock: number; costPrice: string | null }[]
  users: { id: string; storeId: string | null }[]
  storeStocks: { productId: string; storeId: string; quantity: number }[]
}

const daysAgo = (n: number, hour = 11): Date => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d
}

const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

async function clear() {
  const setting = await prisma.storeSetting.findUnique({ where: { key: SNAPSHOT_KEY } })
  if (!setting) {
    console.log('ℹ️  Aucun jeu de démonstration à retirer.')
    return
  }
  const snap = setting.value as unknown as Snapshot

  await prisma.$transaction(async (tx) => {
    await tx.inventory.deleteMany({ where: { reference: { in: snap.inventoryRefs } } })
    await tx.payment.deleteMany({ where: { orderId: { in: snap.orderIds } } })
    await tx.order.deleteMany({ where: { id: { in: snap.orderIds } } })
    await tx.shipment.deleteMany({ where: { id: { in: snap.shipmentIds } } })
    await tx.salesTarget.deleteMany({ where: { id: { in: snap.targetIds } } })
    await tx.expense.deleteMany({ where: { id: { in: snap.expenseIds } } })
    await tx.monthlyClosing.deleteMany({ where: { month: { in: snap.closingMonths } } })
    await tx.priceHistory.deleteMany({ where: { id: { in: snap.priceHistoryIds } } })
    await tx.customer.deleteMany({ where: { id: { in: snap.customerIds } } })

    // La répartition par boutique repart de l'état d'avant : les lignes créées
    // par la démonstration disparaissent, les autres retrouvent leur quantité.
    await tx.storeStock.deleteMany({
      where: { productId: { in: snap.products.map((p) => p.id) } },
    })
    for (const row of snap.storeStocks ?? []) {
      await tx.storeStock.create({ data: row })
    }

    // Stock et coût de revient reviennent exactement à leur valeur d'avant.
    for (const p of snap.products) {
      await tx.product.update({
        where: { id: p.id },
        data: { stock: p.stock, costPrice: p.costPrice },
      })
    }
    for (const u of snap.users) {
      await tx.user.update({ where: { id: u.id }, data: { storeId: u.storeId } })
    }
    await tx.storeSetting.delete({ where: { key: SNAPSHOT_KEY } })
  })

  console.log('✅ Jeu de démonstration retiré, état initial restauré.')
}

async function seed() {
  const existing = await prisma.storeSetting.findUnique({ where: { key: SNAPSHOT_KEY } })
  if (existing) {
    throw new Error(
      'Un jeu de démonstration est déjà en place. Retirez-le d’abord : pnpm run gestion:demo -- --clear',
    )
  }

  const stores = await prisma.store.findMany({ orderBy: { sortOrder: 'asc' } })
  const palmeraie = stores.find((s) => s.slug === 'palmeraie')
  const marcory = stores.find((s) => s.slug === 'grand-marche-marcory')
  const cocody = stores.find((s) => s.slug === 'cocody')
  if (!palmeraie || !marcory || !cocody) {
    throw new Error('Boutiques manquantes. Lancez d’abord : pnpm run gestion:init')
  }

  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  const manager = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  const staff = await prisma.user.findFirst({ where: { role: 'VENDEUR' } })
  if (!admin) throw new Error('Aucun compte SUPER_ADMIN.')

  // Le catalogue n'est pas touché : on se sert des produits déjà en base.
  // Les articles en précommande passent en dernier — les vendre au comptoir
  // n'aurait pas de sens, ils ne sont pas encore sortis.
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ isPreorder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, price: true, stock: true, costPrice: true },
  })
  if (products.length < 2) {
    throw new Error('Il faut au moins deux produits actifs pour peupler la démonstration.')
  }

  const snap: Snapshot = {
    orderIds: [], shipmentIds: [], customerIds: [], expenseIds: [],
    closingMonths: [], targetIds: [], priceHistoryIds: [], inventoryRefs: [],
    products: products.map((p) => ({
      id: p.id,
      stock: p.stock,
      costPrice: p.costPrice === null ? null : String(p.costPrice),
    })),
    users: [admin, manager, staff].filter(Boolean).map((u) => ({ id: u!.id, storeId: u!.storeId })),
    storeStocks: (
      await prisma.storeStock.findMany({
        where: { productId: { in: products.map((p) => p.id) } },
        select: { productId: true, storeId: true, quantity: true },
      })
    ),
  }

  const [main, second] = products
  const actor = { userId: admin.id, role: 'SUPER_ADMIN' }

  // ── Vendeuses rattachées à leur boutique ──────────────────────────────────
  if (staff) await prisma.user.update({ where: { id: staff.id }, data: { storeId: palmeraie.id } })
  if (manager) await prisma.user.update({ where: { id: manager.id }, data: { storeId: cocody.id } })

  // ── Arrivage réceptionné : le transport entre dans le coût de revient ─────
  // Lot partagé : le gros de la marchandise à la Palmeraie, une partie à Cocody.
  const g1 = await shipments.createShipment({
    label: 'Lot cargo — démonstration',
    storeId: palmeraie.id,
    orderedAt: daysAgo(45).toISOString(),
  })
  snap.shipmentIds.push(g1.id)
  snap.inventoryRefs.push(g1.code)
  await shipments.addItem(g1.id, { productId: main.id, quantity: 100, unitCost: 2000, plannedPrice: 6500 })
  await shipments.addItem(g1.id, {
    productId: main.id, storeId: cocody.id, quantity: 50, unitCost: 2000, plannedPrice: 6500,
  })
  const g1Lines = await shipments.addItem(g1.id, { productId: second.id, quantity: 30, unitCost: 12000, plannedPrice: 21000 })
  await shipments.createGroup(g1.id, {
    shippingCost: 90000,
    itemIds: g1Lines.items.map((i) => i.id),
  })
  await shipments.receiveShipment(g1.id)
  console.log(`✅ Arrivage ${g1.code} réceptionné — 180 articles, transport réparti à 500 F/unité`)

  // ── Arrivage encore en brouillon, pour montrer l'autre état de l'écran ────
  const g2 = await shipments.createShipment({
    label: 'Prochain envoi — démonstration',
    storeId: marcory.id,
  })
  snap.shipmentIds.push(g2.id)
  const g2Lines = await shipments.addItem(g2.id, { productId: main.id, quantity: 50, unitCost: 2100, plannedPrice: 6900 })
  await shipments.createGroup(g2.id, { shippingCost: 30000, itemIds: g2Lines.items.map((i) => i.id) })
  console.log(`✅ Arrivage ${g2.code} en brouillon`)

  // ── Ventes réparties sur 40 jours, 3 boutiques, 3 vendeuses ──────────────
  const clients = [
    { name: 'Aïcha Koné', phone: '0708112233' },
    { name: 'Bakary Traoré', phone: '0509887766' },
    { name: 'Mariam Diabaté', phone: '0102334455' },
    { name: 'Fatoumata Cissé', phone: '0745667788' },
  ]

  interface Plan {
    day: number
    store: string
    seller: string | undefined
    client: number | null
    lines: { product: 'main' | 'second'; qty: number; price: number; discount?: number; reason?: string }[]
    payment: 'CASH' | 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER'
  }

  const plans: Plan[] = [
    // ── Mois précédent ────────────────────────────────────────────────────
    { day: 38, store: palmeraie.id, seller: staff?.id, client: 0, lines: [{ product: 'main', qty: 6, price: 6500 }], payment: 'CASH' },
    { day: 36, store: cocody.id, seller: manager?.id, client: 1, lines: [{ product: 'second', qty: 2, price: 21000 }], payment: 'MOBILE_MONEY' },
    { day: 33, store: marcory.id, seller: admin.id, client: null, lines: [{ product: 'main', qty: 4, price: 6500 }], payment: 'CASH' },
    { day: 31, store: palmeraie.id, seller: staff?.id, client: 2, lines: [{ product: 'main', qty: 5, price: 6500, discount: 1500, reason: 'Client fidèle' }], payment: 'CASH' },
    { day: 28, store: cocody.id, seller: manager?.id, client: 3, lines: [{ product: 'second', qty: 3, price: 21000 }], payment: 'CARD' },
    { day: 25, store: palmeraie.id, seller: staff?.id, client: 0, lines: [{ product: 'main', qty: 3, price: 6500 }, { product: 'second', qty: 1, price: 21000 }], payment: 'MOBILE_MONEY' },
    { day: 22, store: marcory.id, seller: admin.id, client: 1, lines: [{ product: 'main', qty: 8, price: 6000, discount: 2000, reason: 'Achat en gros' }], payment: 'CASH' },
    { day: 19, store: cocody.id, seller: manager?.id, client: null, lines: [{ product: 'second', qty: 2, price: 21000 }], payment: 'CASH' },
    { day: 16, store: palmeraie.id, seller: staff?.id, client: 2, lines: [{ product: 'main', qty: 4, price: 6500 }], payment: 'MOBILE_MONEY' },
    { day: 13, store: marcory.id, seller: admin.id, client: 3, lines: [{ product: 'second', qty: 4, price: 21000, discount: 4000, reason: 'Fin de série' }], payment: 'BANK_TRANSFER' },
    { day: 11, store: palmeraie.id, seller: staff?.id, client: 0, lines: [{ product: 'main', qty: 6, price: 6500 }], payment: 'CASH' },
    { day: 9, store: cocody.id, seller: manager?.id, client: 1, lines: [{ product: 'second', qty: 3, price: 21000 }], payment: 'MOBILE_MONEY' },
    // ── Mois en cours ─────────────────────────────────────────────────────
    { day: 5, store: palmeraie.id, seller: staff?.id, client: 0, lines: [{ product: 'main', qty: 8, price: 6500 }], payment: 'CASH' },
    { day: 5, store: marcory.id, seller: admin.id, client: 2, lines: [{ product: 'second', qty: 3, price: 21000 }], payment: 'MOBILE_MONEY' },
    { day: 4, store: cocody.id, seller: manager?.id, client: 3, lines: [{ product: 'second', qty: 4, price: 21000 }], payment: 'CARD' },
    { day: 4, store: palmeraie.id, seller: staff?.id, client: null, lines: [{ product: 'main', qty: 6, price: 6500 }], payment: 'CASH' },
    { day: 3, store: marcory.id, seller: admin.id, client: 1, lines: [{ product: 'main', qty: 10, price: 6500, discount: 5000, reason: 'Achat en gros' }], payment: 'BANK_TRANSFER' },
    { day: 3, store: cocody.id, seller: manager?.id, client: 2, lines: [{ product: 'second', qty: 2, price: 21000 }], payment: 'CASH' },
    { day: 2, store: palmeraie.id, seller: staff?.id, client: 3, lines: [{ product: 'second', qty: 3, price: 21000 }], payment: 'MOBILE_MONEY' },
    { day: 2, store: marcory.id, seller: admin.id, client: null, lines: [{ product: 'main', qty: 7, price: 6500 }], payment: 'CASH' },
    { day: 1, store: cocody.id, seller: manager?.id, client: 0, lines: [{ product: 'main', qty: 5, price: 6500 }], payment: 'CASH' },
    { day: 1, store: palmeraie.id, seller: staff?.id, client: 1, lines: [{ product: 'second', qty: 4, price: 21000, discount: 4000, reason: 'Client fidèle' }], payment: 'CARD' },
    { day: 1, store: marcory.id, seller: admin.id, client: 2, lines: [{ product: 'second', qty: 2, price: 21000 }], payment: 'MOBILE_MONEY' },
    { day: 0, store: palmeraie.id, seller: staff?.id, client: 3, lines: [{ product: 'main', qty: 9, price: 6500 }], payment: 'CASH' },
    { day: 0, store: cocody.id, seller: manager?.id, client: 0, lines: [{ product: 'second', qty: 3, price: 21000 }], payment: 'CASH' },
    { day: 0, store: marcory.id, seller: admin.id, client: null, lines: [{ product: 'main', qty: 6, price: 6500 }], payment: 'MOBILE_MONEY' },
  ]

  let revenue = 0
  for (const plan of plans) {
    const client = plan.client === null ? undefined : clients[plan.client]
    const sale = await sales.createSale(
      {
        storeId: plan.store,
        sellerId: plan.seller,
        customer: client,
        paymentMethod: plan.payment,
        soldAt: daysAgo(plan.day).toISOString(),
        notes: 'Jeu de démonstration',
        items: plan.lines.map((l) => ({
          productId: l.product === 'main' ? main.id : second.id,
          quantity: l.qty,
          unitPrice: l.price,
          discountAmount: l.discount ?? 0,
          discountReason: l.reason,
        })),
      },
      actor,
    )
    snap.orderIds.push(sale.id)
    snap.inventoryRefs.push(sale.orderNumber)
    if (sale.customerId && !snap.customerIds.includes(sale.customerId)) {
      snap.customerIds.push(sale.customerId)
    }
    revenue += Number(sale.total)
  }
  console.log(`✅ ${plans.length} ventes sur 40 jours — ${revenue.toLocaleString('fr-FR')} F encaissés`)

  // ── Dépenses annexes ──────────────────────────────────────────────────────
  const expenseDefs = [
    { day: 34, label: 'Réparation climatiseur', amount: 15000, storeId: palmeraie.id },
    { day: 20, label: 'Transport marchandise interne', amount: 8000, storeId: null },
    { day: 4, label: 'Fournitures d’emballage', amount: 12000, storeId: cocody.id },
    { day: 2, label: 'Dépannage groupe électrogène', amount: 25000, storeId: marcory.id },
  ]
  for (const e of expenseDefs) {
    const created = await finance.createExpense({
      date: daysAgo(e.day).toISOString().slice(0, 10),
      label: e.label,
      amount: e.amount,
      storeId: e.storeId ?? undefined,
      notes: 'Jeu de démonstration',
    })
    snap.expenseIds.push(created.id)
  }
  console.log(`✅ ${expenseDefs.length} dépenses annexes`)

  // ── Clôtures : le mois précédent et le mois en cours ──────────────────────
  const thisMonth = monthKey(new Date())
  const lastMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1))
  for (const month of [lastMonth, thisMonth]) {
    await finance.upsertClosing(month, {
      rent: 100000, salaries: 150000, utilities: 35000,
      transportTaxes: 25000, other: 10000, purchaseRate: 0.65,
      notes: 'Jeu de démonstration',
    })
    snap.closingMonths.push(month)
  }
  console.log(`✅ Clôtures ${lastMonth} et ${thisMonth} (charges 320 000 F)`)

  // ── Objectifs du mois ─────────────────────────────────────────────────────
  for (const [store, amount] of [[palmeraie, 450000], [marcory, 400000], [cocody, 400000]] as const) {
    const t = await targets.upsertTarget({ month: thisMonth, storeId: store.id, amount })
    snap.targetIds.push(t.id)
  }
  console.log('✅ Objectifs du mois pour les 3 boutiques physiques')

  // ── Historique des prix ───────────────────────────────────────────────────
  const basePrice = Number(main.price)
  const changes = [
    { old: basePrice - 500, next: basePrice, day: 30 },
    { old: basePrice, next: basePrice + 400, day: 8 },
    { old: basePrice + 400, next: basePrice, day: 2 },
  ]
  for (const c of changes) {
    const row = await prisma.priceHistory.create({
      data: {
        productId: main.id,
        oldPrice: c.old,
        newPrice: c.next,
        changedById: admin.id,
        createdAt: daysAgo(c.day),
      },
    })
    snap.priceHistoryIds.push(row.id)
  }
  console.log(`✅ ${changes.length} changements de prix historisés`)

  await prisma.storeSetting.create({
    data: { key: SNAPSHOT_KEY, value: snap as unknown as Prisma.InputJsonValue },
  })

  console.log('\n🎉 Jeu de démonstration en place.')
  console.log('   Back-office : http://localhost:5173/admin/gestion')
  console.log('   Pour tout retirer : pnpm run gestion:demo -- --clear')
}

const main2 = process.argv.includes('--clear') ? clear : seed
await main2()
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
