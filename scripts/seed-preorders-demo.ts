/**
 * Précommandes fictives, pour voir la page /collections/produits-a-venir
 * peuplée en développement.
 *
 * La boutique ne contient plus aucun produit écrit en dur : tout vient du
 * back-office. Ce script écrit donc de vraies lignes en base plutôt que de
 * réintroduire des mocks dans le front.
 *
 * Les dates de sortie sont calculées à l'exécution, à des échéances variées,
 * pour couvrir tous les états du compte à rebours : plusieurs semaines, le
 * dernier jour (format heures/minutes/secondes) et une sortie imminente qui
 * bascule sur « Disponible maintenant » pendant le test.
 *
 *   pnpm run preorders:demo            # injecte le jeu
 *   pnpm run preorders:demo -- --clear # le retire
 *
 * Réservé au développement : les lignes portent un slug préfixé, et seules
 * celles-là sont supprimées — le reste du catalogue n'est jamais touché.
 */
import { config } from 'dotenv'

config()

const { prisma } = await import('../src/lib/prisma.js')

/** Préfixe qui identifie les lignes du jeu : rien d'autre n'est supprimé. */
const SLUG_PREFIX = 'demo-precommande-'

const HOUR = 60 * 60 * 1000

interface Demo {
  name: string
  tagline: string
  /** Prix normal, celui qui reprend la main à la sortie. */
  price: number
  /** Tarif de précommande : plus bas, pour afficher le prix barré. */
  preorderPrice: number
  /** Échéance de sortie, en heures à partir de maintenant. */
  inHours: number
  gradientFrom: string
  gradientTo: string
  colors: { name: string; hex: string }[]
}

const DEMOS: Demo[] = [
  {
    name: 'Sac Cabas Horizon',
    tagline: 'Cuir grainé, format 24 h, bandoulière amovible.',
    price: 68_000,
    preorderPrice: 54_000,
    inHours: 24 * 26,
    gradientFrom: 'from-amber-200',
    gradientTo: 'to-amber-500',
    colors: [
      { name: 'Camel', hex: '#b4793a' },
      { name: 'Noir', hex: '#171717' },
    ],
  },
  {
    name: 'Pochette Sahel',
    tagline: 'Petite maroquinerie, tissage main, doublure coton.',
    price: 29_500,
    preorderPrice: 23_900,
    inHours: 24 * 9,
    gradientFrom: 'from-rose-200',
    gradientTo: 'to-rose-500',
    colors: [
      { name: 'Terracotta', hex: '#c2603f' },
      { name: 'Ivoire', hex: '#efe7d8' },
      { name: 'Indigo', hex: '#2f3f6b' },
    ],
  },
  {
    name: 'Sac Épaule Lagune',
    tagline: 'Silhouette souple, fermoir doré, tenue impeccable.',
    price: 52_000,
    preorderPrice: 44_000,
    inHours: 24 * 2 + 5,
    gradientFrom: 'from-sky-200',
    gradientTo: 'to-sky-600',
    colors: [{ name: 'Bleu lagune', hex: '#2b6f8f' }],
  },
  {
    // Moins de 24 h : le décompte passe en heures/minutes/secondes, le format
    // le plus large — c'est lui qui déborde quand la place manque.
    name: 'Ceinture Kente',
    tagline: 'Boucle laiton brossé, motif tissé à la main.',
    price: 18_000,
    preorderPrice: 14_500,
    inHours: 20,
    gradientFrom: 'from-emerald-200',
    gradientTo: 'to-emerald-600',
    colors: [
      { name: 'Vert forêt', hex: '#1f5f43' },
      { name: 'Or', hex: '#c9a227' },
    ],
  },
  {
    name: 'Mini Sac Abidjan',
    tagline: 'Format soirée, chaîne fine, intérieur velours.',
    price: 34_000,
    preorderPrice: 27_500,
    inHours: 3,
    gradientFrom: 'from-violet-200',
    gradientTo: 'to-violet-600',
    colors: [
      { name: 'Prune', hex: '#5b2748' },
      { name: 'Noir', hex: '#171717' },
    ],
  },
  {
    // Sortie imminente : au bout de quelques minutes, la carte bascule d'elle
    // -même sur « Disponible maintenant ». Volontairement sans photo, pour
    // voir aussi le rendu dégradé de repli.
    name: 'Porte-cartes Ébène',
    tagline: 'Quatre emplacements, cuir pleine fleur.',
    price: 12_000,
    preorderPrice: 9_500,
    inHours: 0.1,
    gradientFrom: 'from-zinc-300',
    gradientTo: 'to-zinc-700',
    colors: [{ name: 'Ébène', hex: '#221c18' }],
  },
]

async function clear(): Promise<number> {
  const { count } = await prisma.product.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  })
  return count
}

async function seed() {
  const removed = await clear()
  if (removed > 0) console.log(`🧹 ${removed} précommandes de démo remplacées`)

  // On réutilise les photos déjà en base plutôt que de pointer vers un service
  // extérieur : les cartes montrent de vraies images, sans nouvelle dépendance.
  const pool = await prisma.productImage.findMany({
    select: { url: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Une catégorie existante si la base en a une, sinon rien : la page des
  // précommandes ne filtre pas sur la catégorie.
  const category = await prisma.category.findFirst({ select: { id: true } })

  const now = Date.now()

  for (const [i, d] of DEMOS.entries()) {
    const releaseDate = new Date(now + d.inHours * HOUR)
    // La dernière est laissée sans photo : elle montre le rendu de repli.
    const image = i < DEMOS.length - 1 ? pool[i % Math.max(pool.length, 1)] : undefined

    await prisma.product.create({
      data: {
        name: d.name,
        slug: `${SLUG_PREFIX}${i + 1}`,
        sku: `DEMO-PRE-${i + 1}`,
        shortDescription: d.tagline,
        description: `${d.tagline} Produit de démonstration : il n'existe pas.`,
        price: d.price,
        preorderPrice: d.preorderPrice,
        // Commandes ouvertes tout de suite ; la sortie ferme la fenêtre.
        preorderStartsAt: null,
        releaseDate,
        isPreorder: true,
        isActive: true,
        // Une précommande n'a pas de stock à écouler.
        stock: 0,
        trackInventory: false,
        currency: 'FCFA',
        categoryId: category?.id ?? null,
        tags: 'demo',
        metadata: {
          kind: 'bag',
          demo: true,
          legacyId: 9000 + i,
          tagline: d.tagline,
          gradientFrom: d.gradientFrom,
          gradientTo: d.gradientTo,
          colors: d.colors,
        },
        ...(image ? { images: { create: { url: image.url, alt: d.name, sortOrder: 0 } } } : {}),
      },
    })

    const h = Math.round(d.inHours)
    console.log(`  • ${d.name} — sortie dans ${h >= 24 ? `${Math.floor(h / 24)} j` : `${h} h`}`)
  }

  console.log(`\n✅ ${DEMOS.length} précommandes de démo créées`)
  console.log('   Boutique   : http://localhost:5173/collections/produits-a-venir')
  console.log('   Back-office: http://localhost:5173/admin/products')
  console.log('   Pour tout retirer : pnpm run preorders:demo -- --clear')
}

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Jeu de démonstration : développement uniquement.')
  process.exit(1)
}

const run = process.argv.includes('--clear')
  ? async () => console.log(`🧹 ${await clear()} précommandes de démo supprimées`)
  : seed

await run()
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
