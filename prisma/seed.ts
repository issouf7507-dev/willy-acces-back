import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'

import { BAGS } from '../../willy-accesoire/src/data/bags'
import { ACCESSORIES } from '../../willy-accesoire/src/data/accessories'
import { PREORDERS } from '../../willy-accesoire/src/data/preorders'
import { SALON_SERVICES } from '../../willy-accesoire/src/data/salon'

config()

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const usedSlugs = new Set<string>()
function uniqueSlug(name: string, legacyId: number): string {
  let slug = slugify(name)
  if (usedSlugs.has(slug)) slug = `${slug}-${legacyId}`
  usedSlugs.add(slug)
  return slug
}

function orderNumber(seq: number): string {
  return `WA-SEED-${String(seq).padStart(4, '0')}`
}

/** Minimal représentation d'un produit créé, réutilisée pour paniers/commandes/avis. */
type SeedProduct = {
  id: string
  name: string
  slug: string
  price: number
  sku: string | null
  categoryId: string | null
  stock: number
  isPreorder: boolean
}

// ─── Reset (base de dev) ─────────────────────────────────────────────────────
// Supprime dans l'ordre des dépendances pour rejouer le seed proprement.
async function resetTestData() {
  await prisma.payment.deleteMany({})
  await prisma.orderItem.deleteMany({})
  await prisma.order.deleteMany({})
  await prisma.review.deleteMany({})
  await prisma.cartItem.deleteMany({})
  await prisma.cart.deleteMany({})
  await prisma.inventory.deleteMany({})
  await prisma.couponProduct.deleteMany({})
  await prisma.couponCategory.deleteMany({})
  await prisma.coupon.deleteMany({})
  await prisma.campaignProduct.deleteMany({})
  await prisma.campaign.deleteMany({})
  await prisma.quoteRequest.deleteMany({})
  await prisma.carouselSlide.deleteMany({})
  await prisma.accordionItem.deleteMany({})
  await prisma.salonCatalogueImage.deleteMany({})
  await prisma.salonCatalogue.deleteMany({})
  await prisma.salonService.deleteMany({})
  await prisma.productVariant.deleteMany({})
  await prisma.address.deleteMany({})
  await prisma.product.deleteMany({})
  // On garde l'admin, on retire les autres comptes de test.
  await prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } })
  usedSlugs.clear()
  console.log('🧹 Anciennes données de test supprimées')
}

// ─── Utilisateurs ────────────────────────────────────────────────────────────
type SeedUsers = {
  adminId: string
  managerId: string
  staffId: string
  customers: { id: string; email: string; name: string }[]
}

async function seedUsers(): Promise<SeedUsers> {
  const mk = async (
    email: string,
    name: string,
    role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'CUSTOMER',
    password: string,
    phone?: string,
  ) => {
    const hashed = await bcrypt.hash(password, 12)
    return prisma.user.upsert({
      where: { email },
      update: { name, role, password: hashed, phone, isActive: true },
      create: { email, name, role, password: hashed, phone },
    })
  }

  const admin = await mk('admin@willy-accesoire.com', 'Admin', 'ADMIN', 'Admin1234!', '+2250700000001')
  const manager = await mk('manager@willy-accesoire.com', 'Manager Willy', 'MANAGER', 'Manager1234!', '+2250700000002')
  const staff = await mk('staff@willy-accesoire.com', 'Staff Willy', 'STAFF', 'Staff1234!', '+2250700000003')

  const customerDefs = [
    { email: 'aya@example.com', name: 'Aya Koné', phone: '+2250701010101' },
    { email: 'koffi@example.com', name: 'Koffi N’Guessan', phone: '+2250702020202' },
    { email: 'fatou@example.com', name: 'Fatou Diallo', phone: '+2250703030303' },
  ]
  const customers = []
  for (const c of customerDefs) {
    const u = await mk(c.email, c.name, 'CUSTOMER', 'Client1234!', c.phone)
    customers.push({ id: u.id, email: u.email, name: u.name })
  }

  console.log('✅ Utilisateurs :')
  console.log('   admin@willy-accesoire.com   / Admin1234!    (ADMIN)')
  console.log('   manager@willy-accesoire.com / Manager1234!  (MANAGER)')
  console.log('   staff@willy-accesoire.com   / Staff1234!    (STAFF)')
  console.log('   aya@example.com             / Client1234!   (CUSTOMER)')
  console.log('   koffi@example.com           / Client1234!   (CUSTOMER)')
  console.log('   fatou@example.com           / Client1234!   (CUSTOMER)')

  return { adminId: admin.id, managerId: manager.id, staffId: staff.id, customers }
}

// ─── Adresses ────────────────────────────────────────────────────────────────
async function seedAddresses(users: SeedUsers) {
  const defs = [
    { userId: users.customers[0].id, firstName: 'Aya', lastName: 'Koné', phone: '+2250701010101', street: 'Rue des Jardins, Cocody', city: 'Abidjan', district: 'Cocody', isDefault: true },
    { userId: users.customers[1].id, firstName: 'Koffi', lastName: 'N’Guessan', phone: '+2250702020202', street: 'Boulevard VGE, Marcory', city: 'Abidjan', district: 'Marcory', isDefault: true },
    { userId: users.customers[2].id, firstName: 'Fatou', lastName: 'Diallo', phone: '+2250703030303', street: 'Avenue 12, Plateau', city: 'Abidjan', district: 'Plateau', isDefault: true },
  ]
  const created = []
  for (const d of defs) created.push(await prisma.address.create({ data: d }))
  console.log(`✅ ${created.length} adresses`)
  return created
}

// ─── Catégories ──────────────────────────────────────────────────────────────
async function seedCategories() {
  const defs = [
    { name: 'Sacs', slug: 'sacs', sortOrder: 1 },
    { name: 'Accessoires', slug: 'accessoires', sortOrder: 2 },
    { name: 'Salon de beauté', slug: 'salon-de-beaute', sortOrder: 3 },
  ]
  const map: Record<string, string> = {}
  for (const d of defs) {
    const cat = await prisma.category.upsert({
      where: { slug: d.slug },
      update: { name: d.name, sortOrder: d.sortOrder, isActive: true },
      create: d,
    })
    map[d.slug] = cat.id
  }
  console.log(`✅ ${defs.length} catégories`)
  return map
}

// ─── Produits ────────────────────────────────────────────────────────────────
async function seedProducts(cats: Record<string, string>): Promise<SeedProduct[]> {
  const products: SeedProduct[] = []

  const push = async (data: Parameters<typeof prisma.product.create>[0]['data']) => {
    const p = await prisma.product.create({ data })
    products.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      sku: p.sku,
      categoryId: p.categoryId,
      stock: p.stock,
      isPreorder: p.isPreorder,
    })
  }

  let sku = 100

  for (const b of BAGS) {
    await push({
      name: b.name,
      slug: uniqueSlug(b.name, b.id),
      sku: `SAC-${sku++}`,
      price: b.price,
      compareAtPrice: b.compareAtPrice,
      stock: b.inStock ? 25 : 0,
      currency: 'FCFA',
      categoryId: cats['sacs'],
      isActive: true,
      isFeatured: b.rating >= 4.6,
      isNew: !!b.isNew,
      tags: b.tags.join(','),
      metadata: {
        kind: 'bag', legacyId: b.id, gradientFrom: b.gradientFrom, gradientTo: b.gradientTo,
        colors: b.colors, rating: b.rating, reviews: b.reviews, volume: b.volume,
        weather: b.weather, tags: b.tags, badge: b.badge, soldOut: b.soldOut ?? false,
      },
    })
  }

  for (const a of ACCESSORIES) {
    await push({
      name: a.name,
      slug: uniqueSlug(a.name, a.id),
      sku: `ACC-${sku++}`,
      price: a.price,
      compareAtPrice: a.compareAtPrice,
      stock: 30,
      currency: 'FCFA',
      categoryId: cats['accessoires'],
      isActive: true,
      isFeatured: a.rating >= 4.6,
      tags: '',
      metadata: {
        kind: 'accessory', legacyId: a.id, gradientFrom: a.gradientFrom, gradientTo: a.gradientTo,
        colors: a.colors, rating: a.rating, reviews: a.reviews, accessoryCategory: a.category,
      },
    })
  }

  for (const p of PREORDERS) {
    await push({
      name: p.name,
      slug: uniqueSlug(p.name, p.id),
      sku: `PRE-${sku++}`,
      price: p.price,
      stock: 0,
      currency: 'FCFA',
      categoryId: cats['sacs'],
      isActive: true,
      isPreorder: true,
      releaseDate: new Date(p.releaseDate),
      tags: '',
      metadata: {
        kind: 'bag', legacyId: p.id, gradientFrom: p.gradientFrom, gradientTo: p.gradientTo,
        colors: p.colors, tagline: p.tagline,
      },
    })
  }

  console.log(`✅ ${products.length} produits (${BAGS.length} sacs, ${ACCESSORIES.length} accessoires, ${PREORDERS.length} précommandes)`)
  return products
}

// ─── Variantes (sur les 2 premiers sacs, pour tester les variantes) ──────────
async function seedVariants(products: SeedProduct[]) {
  const targets = products.filter((p) => p.sku?.startsWith('SAC-')).slice(0, 2)
  let n = 0
  for (const p of targets) {
    for (const [i, color] of ['Noir', 'Beige'].entries()) {
      await prisma.productVariant.create({
        data: {
          productId: p.id,
          name: `Couleur : ${color}`,
          options: { color },
          sku: `${p.sku}-V${i + 1}`,
          price: p.price,
          stock: 10,
          isDefault: i === 0,
        },
      })
      n++
    }
  }
  console.log(`✅ ${n} variantes (sur ${targets.length} produits)`)
}

// ─── Coupons ─────────────────────────────────────────────────────────────────
async function seedCoupons() {
  const now = new Date()
  const inAMonth = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
  const defs = [
    { code: 'BIENVENUE10', description: '-10% première commande', type: 'PERCENTAGE' as const, value: 10, minPurchase: 0, maxDiscount: 5000, usageLimit: 1000, perUserLimit: 1, startDate: now, endDate: inAMonth, isActive: true },
    { code: 'SACS5000', description: '-5000 FCFA dès 30000 FCFA', type: 'FIXED' as const, value: 5000, minPurchase: 30000, usageLimit: 200, startDate: now, endDate: inAMonth, isActive: true },
    { code: 'EXPIRE', description: 'Coupon expiré (test)', type: 'PERCENTAGE' as const, value: 20, startDate: new Date('2025-01-01'), endDate: new Date('2025-02-01'), isActive: false },
  ]
  const created = []
  for (const d of defs) created.push(await prisma.coupon.create({ data: d }))
  console.log(`✅ ${created.length} coupons (BIENVENUE10, SACS5000, EXPIRE)`)
  return created
}

// ─── Avis ────────────────────────────────────────────────────────────────────
async function seedReviews(products: SeedProduct[], users: SeedUsers) {
  const targets = products.filter((p) => !p.isPreorder).slice(0, 5)
  const samples = [
    { rating: 5, title: 'Excellent', body: 'Qualité au top, livraison rapide.', isApproved: true },
    { rating: 4, title: 'Très bien', body: 'Conforme à la description.', isApproved: true },
    { rating: 3, title: 'Correct', body: 'Bon produit mais un peu petit.', isApproved: false },
  ]
  let n = 0
  for (const [pi, product] of targets.entries()) {
    // 1 à 2 avis par produit, utilisateurs différents
    const reviewers = users.customers.slice(0, (pi % 2) + 1)
    for (const [ri, user] of reviewers.entries()) {
      const s = samples[(pi + ri) % samples.length]
      await prisma.review.create({
        data: { userId: user.id, productId: product.id, ...s },
      })
      n++
    }
  }
  console.log(`✅ ${n} avis (dont certains en attente de modération)`)
}

// ─── Panier ──────────────────────────────────────────────────────────────────
async function seedCart(products: SeedProduct[], users: SeedUsers) {
  const inStock = products.filter((p) => p.stock > 0).slice(0, 2)
  const cart = await prisma.cart.create({
    data: {
      userId: users.customers[0].id,
      items: {
        create: inStock.map((p, i) => ({
          productId: p.id,
          quantity: i + 1,
          price: p.price,
        })),
      },
    },
  })
  console.log(`✅ 1 panier actif (${users.customers[0].email}, ${inStock.length} articles)`)
  return cart
}

// ─── Commandes + paiements ───────────────────────────────────────────────────
async function seedOrders(
  products: SeedProduct[],
  users: SeedUsers,
  addresses: { id: string; userId: string }[],
) {
  const inStock = products.filter((p) => p.stock > 0)
  const pick = (i: number) => inStock[i % inStock.length]

  type OrderPlan = {
    customerIdx: number
    status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'
    payStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
    method: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CARD'
    items: { p: SeedProduct; qty: number }[]
    daysAgo: number
  }

  const plans: OrderPlan[] = [
    { customerIdx: 0, status: 'PENDING', payStatus: 'PENDING', method: 'CASH', items: [{ p: pick(0), qty: 1 }], daysAgo: 0 },
    { customerIdx: 0, status: 'CONFIRMED', payStatus: 'PAID', method: 'MOBILE_MONEY', items: [{ p: pick(1), qty: 2 }], daysAgo: 2 },
    { customerIdx: 1, status: 'PROCESSING', payStatus: 'PAID', method: 'MOBILE_MONEY', items: [{ p: pick(2), qty: 1 }, { p: pick(3), qty: 1 }], daysAgo: 4 },
    { customerIdx: 1, status: 'SHIPPED', payStatus: 'PAID', method: 'CARD', items: [{ p: pick(4), qty: 3 }], daysAgo: 7 },
    { customerIdx: 2, status: 'DELIVERED', payStatus: 'PAID', method: 'BANK_TRANSFER', items: [{ p: pick(5), qty: 1 }], daysAgo: 12 },
    { customerIdx: 2, status: 'CANCELLED', payStatus: 'FAILED', method: 'MOBILE_MONEY', items: [{ p: pick(6), qty: 2 }], daysAgo: 15 },
    { customerIdx: 0, status: 'REFUNDED', payStatus: 'REFUNDED', method: 'CARD', items: [{ p: pick(7), qty: 1 }], daysAgo: 20 },
  ]

  let seq = 1
  for (const plan of plans) {
    const customer = users.customers[plan.customerIdx]
    const address = addresses.find((a) => a.userId === customer.id)
    const subtotal = plan.items.reduce((s, it) => s + it.p.price * it.qty, 0)
    const total = subtotal
    const createdAt = new Date(Date.now() - plan.daysAgo * 24 * 3600 * 1000)
    const paid = plan.payStatus === 'PAID'

    await prisma.order.create({
      data: {
        orderNumber: orderNumber(seq++),
        userId: customer.id,
        addressId: address?.id,
        status: plan.status,
        subtotal,
        total,
        customerName: customer.name,
        customerEmail: customer.email,
        createdAt,
        items: {
          create: plan.items.map((it) => ({
            productId: it.p.id,
            name: it.p.name,
            sku: it.p.sku,
            quantity: it.qty,
            price: it.p.price,
            total: it.p.price * it.qty,
          })),
        },
        payment: {
          create: {
            amount: total,
            status: plan.payStatus,
            method: plan.method,
            paidAt: paid ? createdAt : null,
            transactionId: paid ? `TX-${orderNumber(seq)}` : null,
          },
        },
      },
    })
  }
  console.log(`✅ ${plans.length} commandes (tous statuts) + paiements`)
}

// ─── Mouvements de stock ─────────────────────────────────────────────────────
async function seedInventory(products: SeedProduct[]) {
  const targets = products.filter((p) => p.stock > 0).slice(0, 4)
  let n = 0
  for (const p of targets) {
    await prisma.inventory.create({ data: { productId: p.id, quantity: 50, type: 'RESTOCK', note: 'Réapprovisionnement initial' } })
    await prisma.inventory.create({ data: { productId: p.id, quantity: -3, type: 'SALE', note: 'Ventes' } })
    n += 2
  }
  console.log(`✅ ${n} mouvements de stock`)
}

// ─── Campagnes ───────────────────────────────────────────────────────────────
async function seedCampaigns(products: SeedProduct[]) {
  const featured = products.slice(0, 3).map((p) => ({ productId: p.id }))
  const defs = [
    { name: 'Nouveautés sacs', type: 'EMAIL' as const, subject: 'Découvrez nos nouveaux sacs', content: '<h1>Nouvelle collection</h1>', status: 'SENT' as const, sentCount: 342, sentAt: new Date() },
    { name: 'Promo WhatsApp', type: 'WHATSAPP' as const, content: 'Profitez de -10% avec BIENVENUE10', status: 'SCHEDULED' as const, scheduledAt: new Date(Date.now() + 2 * 24 * 3600 * 1000) },
    { name: 'Brouillon SMS', type: 'SMS' as const, content: 'Message en préparation', status: 'DRAFT' as const },
  ]
  let n = 0
  for (const d of defs) {
    await prisma.campaign.create({ data: { ...d, products: { create: featured } } })
    n++
  }
  console.log(`✅ ${n} campagnes (EMAIL/WHATSAPP/SMS)`)
}

// ─── Demandes de devis (salon) ───────────────────────────────────────────────
async function seedQuotes() {
  const defs = [
    { name: 'Mariam T.', phone: '+2250705050505', email: 'mariam@example.com', services: ['Coiffure', 'Maquillage'], occasion: 'Mariage', eventDate: new Date(Date.now() + 21 * 24 * 3600 * 1000), location: 'domicile', guests: 4, budget: '50 000 – 100 000 F', message: 'Préparation de la mariée et 3 demoiselles.', status: 'NEW' as const },
    { name: 'Awa B.', phone: '+2250706060606', services: ['Onglerie'], occasion: 'Au quotidien', location: 'salon', guests: 1, budget: 'Moins de 25 000 F', status: 'IN_REVIEW' as const },
    { name: 'Chloé K.', phone: '+2250707070707', email: 'chloe@example.com', services: ['Tresses & Extensions', 'Soins du visage'], occasion: 'Shooting photo', location: 'salon', guests: 2, budget: '25 000 – 50 000 F', status: 'QUOTED' as const, adminNote: 'Devis envoyé par WhatsApp.' },
  ]
  let n = 0
  for (const d of defs) {
    await prisma.quoteRequest.create({ data: d })
    n++
  }
  console.log(`✅ ${n} demandes de devis salon`)
}

// ─── Carrousel ───────────────────────────────────────────────────────────────
async function seedCarousel() {
  const defs = [
    { title: 'Nouvelle collection', subtitle: 'Sacs & accessoires', imageUrl: 'https://placehold.co/1200x500/1e293b/ffffff?text=Collection', linkUrl: '/sacs', altText: 'Collection', sortOrder: 1, isActive: true },
    { title: 'Salon de beauté', subtitle: 'Prenez rendez-vous', imageUrl: 'https://placehold.co/1200x500/831843/ffffff?text=Salon', linkUrl: '/salon', altText: 'Salon', sortOrder: 2, isActive: true },
    { title: '-10% BIENVENUE10', subtitle: 'Sur votre 1ère commande', imageUrl: 'https://placehold.co/1200x500/166534/ffffff?text=Promo', linkUrl: '/accessoires', altText: 'Promo', sortOrder: 3, isActive: true },
  ]
  for (const d of defs) await prisma.carouselSlide.create({ data: d })
  console.log(`✅ ${defs.length} slides de carrousel`)
}

// ─── FAQ (accordéon) ─────────────────────────────────────────────────────────
async function seedAccordion() {
  const defs = [
    { question: 'Quels sont les délais de livraison ?', answer: 'Livraison à Abidjan sous 24 à 48h.', sortOrder: 1, isActive: true },
    { question: 'Quels moyens de paiement acceptez-vous ?', answer: 'Espèces, Mobile Money, carte bancaire et virement.', sortOrder: 2, isActive: true },
    { question: 'Puis-je retourner un article ?', answer: 'Oui, sous 7 jours si l’article est intact.', sortOrder: 3, isActive: true },
    { question: 'Proposez-vous des prestations à domicile ?', answer: 'Oui, le salon se déplace pour les mariages et événements.', sortOrder: 4, isActive: true },
  ]
  for (const d of defs) await prisma.accordionItem.create({ data: d })
  console.log(`✅ ${defs.length} questions FAQ`)
}

// ─── Services salon (prestations) ────────────────────────────────────────────
async function seedSalonServices() {
  for (const [i, s] of SALON_SERVICES.entries()) {
    await prisma.salonService.create({
      data: {
        name: s.name,
        description: s.description,
        priceFrom: s.priceFrom,
        gradientFrom: s.gradientFrom,
        gradientTo: s.gradientTo,
        sortOrder: i,
        isActive: true,
      },
    })
  }
  console.log(`✅ ${SALON_SERVICES.length} services salon`)
}

// ─── Catalogues salon ────────────────────────────────────────────────────────
async function seedSalonCatalogues() {
  const defs = [
    { title: 'Coiffure & Tresses', description: 'Nos réalisations coiffure.', sortOrder: 1, images: ['https://placehold.co/600x600/be123c/fff?text=Coiffure+1', 'https://placehold.co/600x600/9f1239/fff?text=Coiffure+2'] },
    { title: 'Maquillage', description: 'Make-up jour et soirée.', sortOrder: 2, images: ['https://placehold.co/600x600/a21caf/fff?text=Makeup+1'] },
    { title: 'Onglerie', description: 'Nail art et poses gel.', sortOrder: 3, images: ['https://placehold.co/600x600/7c3aed/fff?text=Ongles+1', 'https://placehold.co/600x600/6d28d9/fff?text=Ongles+2'] },
  ]
  for (const d of defs) {
    await prisma.salonCatalogue.create({
      data: {
        title: d.title,
        description: d.description,
        sortOrder: d.sortOrder,
        isActive: true,
        images: { create: d.images.map((url, i) => ({ imageUrl: url, alt: d.title, sortOrder: i })) },
      },
    })
  }
  console.log(`✅ ${defs.length} catalogues salon`)
}

// ─── Réglages boutique ───────────────────────────────────────────────────────
async function seedSettings() {
  const settings: Record<string, string> = {
    storeName: 'Willy Accessoires',
    contactPhone: '+225 07 00 00 00 00',
    contactEmail: 'contact@willy-accesoire.com',
    whatsappNumber: '+2250700000000',
    announcement: 'Livraison gratuite dès 50 000 FCFA à Abidjan 🚚',
    freeShippingThreshold: '50000',
  }
  for (const [key, value] of Object.entries(settings)) {
    await prisma.storeSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
  console.log(`✅ ${Object.keys(settings).length} réglages boutique`)
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seed en cours...\n')
  await resetTestData()
  const users = await seedUsers()
  const addresses = await seedAddresses(users)
  const cats = await seedCategories()
  const products = await seedProducts(cats)
  await seedVariants(products)
  await seedCoupons()
  await seedReviews(products, users)
  await seedCart(products, users)
  await seedOrders(products, users, addresses)
  await seedInventory(products)
  await seedCampaigns(products)
  await seedQuotes()
  await seedSalonServices()
  await seedCarousel()
  await seedAccordion()
  await seedSalonCatalogues()
  await seedSettings()
  console.log('\n🎉 Seed terminé — la base est prête à être testée.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
