import { Router } from 'express'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import financeRouter from './finance.router.js'
import reportsRouter from './reports.router.js'
import salesRouter from './sales.router.js'
import shipmentsRouter from './shipments.router.js'
import transfersRouter from './transfers.router.js'
import * as storesService from './stores.service.js'
import * as customersService from './customers.service.js'
import { CreateStoreSchema, UpdateStoreSchema } from './stores.types.js'
import {
  CreateCustomerSchema,
  CustomerQuerySchema,
  UpdateCustomerSchema,
} from './customers.types.js'

const router = Router()

/**
 * La vendeuse n'entre pas dans la gestion, à une exception près : la caisse a
 * besoin de la liste des boutiques pour savoir où la vente est encaissée. Les
 * fiches clients, elles, sont alimentées par la vente elle-même — le téléphone
 * saisi à la caisse retrouve ou crée la fiche — donc le comptoir n'a pas à les
 * lister.
 *
 * Créer ou modifier une boutique reste au sommet : y toucher déplace des
 * chiffres déjà publiés (recettes, objectifs).
 */
const readStores = [authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR')] as const
const readAdmin = [authenticate, requireRole('SUPER_ADMIN', 'ADMIN')] as const
const writeAdmin = [authenticate, requireRole('SUPER_ADMIN', 'ADMIN')] as const
const writeSuperAdmin = [authenticate, requireRole('SUPER_ADMIN')] as const

// ─── Rapports de pilotage et objectifs ───────────────────────────────────────
router.use('/reports', reportsRouter)

// ─── Dépenses et bilan mensuel ───────────────────────────────────────────────
// Sous-routeur : comptes de l'entreprise, jamais le comptoir.
router.use('/finance', financeRouter)

// ─── Ventes comptoir ─────────────────────────────────────────────────────────
// Sous-routeur : le VENDEUR y est admis, chaque rôle étant borné dans le service.
router.use('/sales', salesRouter)

// ─── Arrivages ───────────────────────────────────────────────────────────────
// Sous-routeur : il porte ses propres droits (jamais le comptoir).
router.use('/shipments', shipmentsRouter)

// ─── Transferts entre boutiques ──────────────────────────────────────────────
router.use('/transfers', transfersRouter)

// ─── Boutiques ───────────────────────────────────────────────────────────────

router.get('/stores', ...readStores, async (req, res, next) => {
  try {
    const stores = await storesService.listStores(req.query.all === 'true')
    res.json({ success: true, data: stores })
  } catch (err) {
    next(err)
  }
})

router.get('/stores/:id', ...readStores, async (req, res, next) => {
  try {
    res.json({ success: true, data: await storesService.getStore(String(req.params.id)) })
  } catch (err) {
    next(err)
  }
})

router.post('/stores', ...writeSuperAdmin, async (req, res, next) => {
  try {
    const input = CreateStoreSchema.parse(req.body)
    res.status(201).json({ success: true, data: await storesService.createStore(input) })
  } catch (err) {
    next(err)
  }
})

router.patch('/stores/:id', ...writeSuperAdmin, async (req, res, next) => {
  try {
    const input = UpdateStoreSchema.parse(req.body)
    const store = await storesService.updateStore(String(req.params.id), input)
    res.json({ success: true, data: store })
  } catch (err) {
    next(err)
  }
})

router.delete('/stores/:id', ...writeSuperAdmin, async (req, res, next) => {
  try {
    await storesService.deleteStore(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

// ─── Clients de comptoir ─────────────────────────────────────────────────────

router.get('/customers', ...readAdmin, async (req, res, next) => {
  try {
    const query = CustomerQuerySchema.parse(req.query)
    res.json({ success: true, data: await customersService.listCustomers(query) })
  } catch (err) {
    next(err)
  }
})

router.get('/customers/:id', ...readAdmin, async (req, res, next) => {
  try {
    res.json({ success: true, data: await customersService.getCustomer(String(req.params.id)) })
  } catch (err) {
    next(err)
  }
})

router.post('/customers', ...writeAdmin, async (req, res, next) => {
  try {
    const input = CreateCustomerSchema.parse(req.body)
    res.status(201).json({ success: true, data: await customersService.createCustomer(input) })
  } catch (err) {
    next(err)
  }
})

router.patch('/customers/:id', ...writeAdmin, async (req, res, next) => {
  try {
    const input = UpdateCustomerSchema.parse(req.body)
    const customer = await customersService.updateCustomer(String(req.params.id), input)
    res.json({ success: true, data: customer })
  } catch (err) {
    next(err)
  }
})

router.delete('/customers/:id', ...writeAdmin, async (req, res, next) => {
  try {
    await customersService.deleteCustomer(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router
