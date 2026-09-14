import { Router } from 'express'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import { resolveStoreScope } from '../../lib/store-scope.js'
import * as service from './sales.service.js'
import { CashInSchema, CreateSaleSchema, SalesQuerySchema } from './sales.types.js'
import { AppError } from '../../middlewares/errors.js'

const router = Router()

/**
 * Le comptoir fait partie du métier de la vendeuse : le VENDEUR est admis ici,
 * contrairement aux arrivages. Le service restreint ensuite chaque vendeuse à
 * sa boutique et à son propre nom.
 */
router.use(authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'))

router.get('/', async (req, res, next) => {
  try {
    const query = SalesQuerySchema.parse(req.query)
    // Une vendeuse lit les ventes de sa boutique, pas celles des autres — même
    // borne qu'à l'encaissement.
    const storeId = await resolveStoreScope(req.user!, query.storeId)
    res.json({ success: true, data: await service.listSales({ ...query, storeId }) })
  } catch (err) {
    next(err)
  }
})

/**
 * La file des commandes du site en attente d'encaissement. Avant `/:id`, sinon
 * « unpaid » serait lu comme un identifiant.
 */
router.get('/unpaid', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await service.listUnpaidOrders() })
  } catch (err) {
    next(err)
  }
})

/** Encaisse une commande existante : elle devient la vente, sans ressaisie. */
router.post('/:id/cash-in', async (req, res, next) => {
  try {
    const input = CashInSchema.parse(req.body)
    const sale = await service.cashInOrder(String(req.params.id), input, req.user!)
    res.json({ success: true, data: sale })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const sale = await service.getSale(String(req.params.id))
    const scope = await resolveStoreScope(req.user!, undefined)
    if (scope && sale.storeId !== scope) {
      throw new AppError('Cette vente n’a pas été faite dans votre boutique.', 403)
    }
    res.json({ success: true, data: sale })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const input = CreateSaleSchema.parse(req.body)
    const sale = await service.createSale(input, req.user!)
    res.status(201).json({ success: true, data: sale })
  } catch (err) {
    next(err)
  }
})

export default router
