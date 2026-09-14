/**
 * Garde-fou exécuté sur le serveur AVANT `prisma db push --accept-data-loss`.
 *
 * `db push` aligne la base sur le schéma sans jamais lire prisma/migrations : il
 * supprime donc les colonnes retirées du schéma sans reprendre leur contenu.
 * Ce script fait deux choses avant qu'il ne s'exécute :
 *
 *   1. une sauvegarde complète de la base, horodatée ;
 *   2. les reprises de données que `db push` ne sait pas faire.
 *
 * Il est idempotent : le relancer à chaque déploiement ne change rien une fois
 * le travail effectué. En cas d'échec, il sort en erreur pour interrompre le
 * déploiement avant toute modification destructrice.
 */
import 'dotenv/config'
import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { prisma } from '../src/lib/prisma.js'

const BACKUP_KEEP = 10

function log(step: string, message: string) {
  console.log(`[pre-deploy] ${step} — ${message}`)
}

// ─── 1. Sauvegarde ───────────────────────────────────────────────────────────

/**
 * `mysqldump` de la base pointée par DATABASE_URL, compressé et horodaté.
 * Le mot de passe passe par MYSQL_PWD et non par la ligne de commande, qui est
 * lisible par tout utilisateur de la machine via `ps`.
 */
function backupDatabase(): string {
  const url = new URL(process.env.DATABASE_URL!)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const user = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const host = url.hostname
  const port = url.port || '3306'

  const dir = path.join(homedir(), 'backups', 'willy-db')
  mkdirSync(dir, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(dir, `${database}-${stamp}.sql.gz`)

  // --single-transaction : dump cohérent sans verrouiller les écritures.
  // --no-tablespaces : évite l'erreur « Access denied … PROCESS privilege »
  //   sur les hébergements mutualisés, où l'utilisateur n'est pas root.
  const cmd =
    `mysqldump --single-transaction --quick --no-tablespaces ` +
    `-h ${host} -P ${port} -u ${user} ${database} | gzip > ${file}`

  execSync(cmd, {
    shell: '/bin/bash',
    env: { ...process.env, MYSQL_PWD: password },
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  const size = statSync(file).size
  if (size < 1024) {
    throw new Error(`Sauvegarde suspecte : ${file} ne fait que ${size} octets`)
  }

  log('sauvegarde', `${file} (${(size / 1024 / 1024).toFixed(1)} Mo)`)
  return dir
}

/** Ne conserve que les BACKUP_KEEP sauvegardes les plus récentes. */
function pruneBackups(dir: string) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql.gz'))
    .map((f) => ({ f, t: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)

  for (const { f } of files.slice(BACKUP_KEEP)) {
    rmSync(path.join(dir, f))
    log('purge', `ancienne sauvegarde supprimée : ${f}`)
  }
}

// ─── 2. Reprises de données ──────────────────────────────────────────────────

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table,
  )
  return rows.length > 0
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  )
  return rows.length > 0
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    table,
    index,
  )
  return rows.length > 0
}

/**
 * Ancien modèle : `price` portait le prix remisé et `compareAtPrice` le prix
 * normal barré. Nouveau modèle : `price` est le prix normal et la remise vit
 * dans `promoPrice`, sur une fenêtre datée.
 *
 * `db push` se contenterait de supprimer `compareAtPrice`, ce qui ferait du prix
 * remisé le prix définitif et perdrait le prix normal. On déplace donc la valeur
 * avant, en créant au besoin les colonnes cibles — `db push` les verrait sinon
 * arriver trop tard.
 */
async function migratePromoPrices() {
  if (!(await columnExists('products', 'compareAtPrice'))) {
    log('promotions', 'rien à faire (colonne compareAtPrice déjà retirée)')
    return
  }

  const toAdd: string[] = []
  if (!(await columnExists('products', 'promoPrice'))) toAdd.push('ADD COLUMN `promoPrice` DECIMAL(12, 2) NULL')
  if (!(await columnExists('products', 'promoStartsAt'))) toAdd.push('ADD COLUMN `promoStartsAt` DATETIME(3) NULL')
  if (!(await columnExists('products', 'promoEndsAt'))) toAdd.push('ADD COLUMN `promoEndsAt` DATETIME(3) NULL')

  if (toAdd.length > 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`products\` ${toAdd.join(', ')}`)
    log('promotions', `${toAdd.length} colonne(s) de promotion créée(s)`)
  }

  // Seuls les prix barrés réellement supérieurs au prix de vente décrivent une
  // remise. Un prix barré inférieur ou égal est une saisie sans effet, qui
  // disparaîtra avec la colonne.
  const moved = await prisma.$executeRawUnsafe(
    `UPDATE \`products\`
     SET \`promoPrice\` = \`price\`,
         \`price\` = \`compareAtPrice\`
     WHERE \`compareAtPrice\` IS NOT NULL
       AND \`compareAtPrice\` > \`price\`
       AND \`promoPrice\` IS NULL`,
  )

  log('promotions', `${moved} produit(s) converti(s) en promotion sans échéance`)
  if (moved > 0) {
    log('promotions', 'pensez à leur fixer une date de fin depuis le back-office')
  }
}

/**
 * Ancien modèle : une précommande portait un seul produit, à plat
 * (`productName`, `unitPrice`, `color`, `quantity`…). Nouveau modèle : la
 * demande ne garde que le client, et les produits vivent dans
 * `preorder_request_items` — un client peut réserver plusieurs articles en une
 * seule demande, avec un seul statut à suivre.
 *
 * `db push` créerait la table des lignes vide puis supprimerait les colonnes
 * produit : toutes les précommandes déjà reçues perdraient ce qu'elles
 * contiennent. On recopie donc chaque demande en une ligne avant.
 */
async function migratePreorderItems() {
  if (!(await columnExists('preorder_requests', 'productName'))) {
    log('précommandes', 'rien à faire (lignes déjà extraites)')
    return
  }

  // `db push` créerait la table lui-même, mais trop tard : la reprise doit
  // pouvoir écrire dedans avant que les colonnes source ne disparaissent.
  if (!(await tableExists('preorder_request_items'))) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`preorder_request_items\` (
         \`id\` VARCHAR(191) NOT NULL,
         \`requestId\` VARCHAR(191) NOT NULL,
         \`productId\` VARCHAR(191) NULL,
         \`productName\` VARCHAR(191) NOT NULL,
         \`unitPrice\` DECIMAL(12, 2) NOT NULL,
         \`releaseDate\` DATETIME(3) NULL,
         \`color\` VARCHAR(191) NULL,
         \`quantity\` INTEGER NOT NULL DEFAULT 1,
         INDEX \`preorder_request_items_requestId_idx\`(\`requestId\`),
         INDEX \`preorder_request_items_productId_idx\`(\`productId\`),
         PRIMARY KEY (\`id\`)
       ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
    log('précommandes', 'table des lignes créée')
  }

  // `NOT EXISTS` rend la reprise rejouable : une demande déjà éclatée en
  // lignes n'est pas recopiée une seconde fois.
  const moved = await prisma.$executeRawUnsafe(
    `INSERT INTO \`preorder_request_items\`
       (\`id\`, \`requestId\`, \`productId\`, \`productName\`, \`unitPrice\`, \`releaseDate\`, \`color\`, \`quantity\`)
     SELECT UUID(), r.\`id\`, r.\`productId\`, r.\`productName\`, r.\`unitPrice\`,
            r.\`releaseDate\`, r.\`color\`, r.\`quantity\`
     FROM \`preorder_requests\` r
     WHERE NOT EXISTS (
       SELECT 1 FROM \`preorder_request_items\` i WHERE i.\`requestId\` = r.\`id\`
     )`,
  )

  log('précommandes', `${moved} demande(s) convertie(s) en lignes`)
}

/**
 * Passage à trois rôles de back-office : SUPER_ADMIN, ADMIN, VENDEUR.
 *
 * `db push` se contenterait de resserrer l'énumération sur les nouvelles
 * valeurs : MySQL tronquerait alors en chaîne vide tous les comptes restés en
 * `STAFF` ou `MANAGER`, et il ne resterait plus **aucun** SUPER_ADMIN — donc
 * plus personne pour clôturer un mois ni nommer un pair, le service interdisant
 * à un ADMIN d'accorder ce rôle.
 *
 * On élargit donc l'énumération à l'union des anciennes et des nouvelles
 * valeurs, on remappe, et `db push` n'a plus qu'à retirer les valeurs devenues
 * inutilisées. Aucun compte n'est supprimé : chacun garde au minimum ce qu'il
 * pouvait déjà faire.
 */
async function migrateRoles() {
  const rows = await prisma.$queryRawUnsafe<{ COLUMN_TYPE: string }[]>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
  )
  const columnType = rows[0]?.COLUMN_TYPE ?? ''

  if (!columnType.includes("'STAFF'") && !columnType.includes("'MANAGER'")) {
    log('rôles', 'rien à faire (déjà migrés)')
    return
  }

  await prisma.$executeRawUnsafe(
    "ALTER TABLE `users` MODIFY `role` " +
      "ENUM('CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN', 'VENDEUR', 'SUPER_ADMIN') " +
      "NOT NULL DEFAULT 'CUSTOMER'",
  )

  // L'ordre compte : l'ancien ADMIN doit devenir SUPER_ADMIN avant que MANAGER
  // ne prenne le nom d'ADMIN, sinon les deux populations se confondraient.
  const owners = await prisma.$executeRawUnsafe(
    "UPDATE `users` SET `role` = 'SUPER_ADMIN' WHERE `role` = 'ADMIN'",
  )
  const admins = await prisma.$executeRawUnsafe(
    "UPDATE `users` SET `role` = 'ADMIN' WHERE `role` = 'MANAGER'",
  )
  const sellers = await prisma.$executeRawUnsafe(
    "UPDATE `users` SET `role` = 'VENDEUR' WHERE `role` = 'STAFF'",
  )

  log('rôles', `${owners} ADMIN → SUPER_ADMIN, ${admins} MANAGER → ADMIN, ${sellers} STAFF → VENDEUR`)

  // Un back-office sans super administrateur ne se répare pas depuis l'écran
  // Utilisateurs : seul un SUPER_ADMIN peut accorder ce rôle.
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    "SELECT COUNT(*) AS n FROM `users` WHERE `role` = 'SUPER_ADMIN' AND `isActive` = 1",
  )
  if (Number(n) === 0) {
    log('rôles', '⚠️  aucun SUPER_ADMIN actif — lancez `pnpm run admin:create` après le déploiement')
  }
}

/**
 * Passage au stock tenu par boutique.
 *
 * Deux choses que `db push` ne sait pas faire seul :
 *
 *   1. `shipment_items.storeId` arrive NOT NULL : posée d'emblée sur une table
 *      qui contient déjà des lignes, la colonne ferait échouer l'ALTER. On
 *      l'ajoute nullable et on la renseigne avant.
 *   2. `store_stocks` doit être **remplie** dans la foulée de sa création. Une
 *      table vide voudrait dire « zéro partout » : la caisse refuserait toutes
 *      les ventes dès le redémarrage.
 *
 * La boutique qui reçoit le stock existant se choisit avec la variable
 * d'environnement `INITIAL_STOCK_STORE` (son nom exact). Sans elle, on prend la
 * boutique en ligne par défaut, puis la première dans l'ordre d'affichage. Ce
 * qui se trouve ailleurs se régularise ensuite par un transfert.
 */
async function migrateStoreStock() {
  if (!(await tableExists('stores'))) {
    log('stock par boutique', 'rien à faire (boutiques pas encore installées)')
    return
  }

  const wanted = process.env.INITIAL_STOCK_STORE?.trim()
  const stores = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
    `SELECT \`id\`, \`name\` FROM \`stores\`
     ORDER BY \`isDefaultOnline\` DESC, \`sortOrder\` ASC, \`name\` ASC`,
  )
  if (stores.length === 0) {
    log('stock par boutique', 'rien à faire (aucune boutique enregistrée)')
    return
  }

  const target = wanted ? stores.find((s) => s.name === wanted) : stores[0]
  if (wanted && !target) {
    throw new Error(
      `INITIAL_STOCK_STORE = « ${wanted} » ne correspond à aucune boutique. ` +
        `Boutiques connues : ${stores.map((s) => s.name).join(', ')}`,
    )
  }
  const store = target!

  // 1. La boutique de chaque ligne d'arrivage déjà saisie.
  if (!(await columnExists('shipment_items', 'storeId'))) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `shipment_items` ADD COLUMN `storeId` VARCHAR(191) NULL',
    )
    const filled = await prisma.$executeRawUnsafe(
      'UPDATE `shipment_items` SET `storeId` = ? WHERE `storeId` IS NULL',
      store.id,
    )
    log('stock par boutique', `${filled} ligne(s) d'arrivage rattachée(s) à « ${store.name} »`)
  }

  // 2. L'unicité des lignes d'arrivage, qui passe de (arrivage, produit) à
  //    (arrivage, produit, boutique).
  //
  //    MySQL refuse de supprimer un index tant qu'une clé étrangère s'appuie
  //    dessus — ici `shipmentId`. Le nouvel index commence par la même colonne :
  //    créé d'abord, il prend le relais et l'ancien devient supprimable. On le
  //    fait ici plutôt que de laisser `db push` s'y casser les dents en plein
  //    déploiement.
  if (!(await indexExists('shipment_items', 'shipment_items_shipmentId_productId_storeId_key'))) {
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX `shipment_items_shipmentId_productId_storeId_key` ' +
        'ON `shipment_items`(`shipmentId`, `productId`, `storeId`)',
    )
    log('stock par boutique', 'index d’unicité par boutique créé')
  }
  if (await indexExists('shipment_items', 'shipment_items_shipmentId_productId_key')) {
    await prisma.$executeRawUnsafe(
      'DROP INDEX `shipment_items_shipmentId_productId_key` ON `shipment_items`',
    )
    log('stock par boutique', 'ancien index d’unicité retiré')
  }

  // 3. La répartition de départ.
  if (!(await tableExists('store_stocks'))) {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE `store_stocks` (' +
        '`id` VARCHAR(191) NOT NULL,' +
        '`productId` VARCHAR(191) NOT NULL,' +
        '`storeId` VARCHAR(191) NOT NULL,' +
        '`quantity` INTEGER NOT NULL DEFAULT 0,' +
        '`updatedAt` DATETIME(3) NOT NULL,' +
        'UNIQUE INDEX `store_stocks_productId_storeId_key`(`productId`, `storeId`),' +
        'INDEX `store_stocks_storeId_idx`(`storeId`),' +
        'PRIMARY KEY (`id`)' +
        ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    )
    log('stock par boutique', 'table du stock par boutique créée')
  }

  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    'SELECT COUNT(*) AS n FROM `store_stocks`',
  )
  if (Number(n) > 0) {
    log('stock par boutique', 'rien à faire (répartition déjà en place)')
    return
  }

  const moved = await prisma.$executeRawUnsafe(
    'INSERT INTO `store_stocks` (`id`, `productId`, `storeId`, `quantity`, `updatedAt`) ' +
      'SELECT UUID(), p.`id`, ?, p.`stock`, NOW(3) FROM `products` p WHERE p.`stock` > 0',
    store.id,
  )
  log('stock par boutique', `${moved} produit(s) affecté(s) à « ${store.name} »`)
  log('stock par boutique', 'régularisez ce qui est ailleurs depuis Gestion › Transferts')
}

// ─── Exécution ───────────────────────────────────────────────────────────────

async function main() {
  const dir = backupDatabase()
  pruneBackups(dir)
  await migrateRoles()
  await migrateStoreStock()
  await migratePromoPrices()
  await migratePreorderItems()
  log('terminé', 'la base peut être mise à jour sans perte')
}

main()
  .catch((err) => {
    console.error('[pre-deploy] ÉCHEC — déploiement interrompu avant toute modification')
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
