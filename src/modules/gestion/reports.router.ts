import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import * as reports from './reports.service.js'
import * as targets from './targets.service.js'
import * as sales from './sales.service.js'
import { DailyReportQuerySchema } from './sales.types.js'
import { TargetQuerySchema, UpsertTargetSchema } from './targets.types.js'

const router = Router()

/**
 * Rapports de pilotage, à deux niveaux :
 *
 * - `owner` : ce qui dit combien l'entreprise gagne — recettes et tableau de
 *   bord. Réservé au SUPER_ADMIN ; c'est la seule chose que l'ADMIN ne voit pas.
 * - `management` : ce qui sert à travailler — stock, marges, clients,
 *   vendeuses, objectifs. Ouvert à l'ADMIN.
 *
 * Le comptoir n'a accès à aucun rapport.
 */
router.use(authenticate)

const owner = requireRole('SUPER_ADMIN')
const management = requireRole('SUPER_ADMIN', 'ADMIN')

/** Recettes par jour et par boutique — remplace l'onglet du même nom. */
router.get('/daily', owner, async (req, res, next) => {
  try {
    const query = DailyReportQuerySchema.parse(req.query)
    res.json({ success: true, data: await sales.dailyRevenue(query) })
  } catch (err) {
    next(err)
  }
})

router.get('/dashboard', owner, async (_req, res, next) => {
  try {
    res.json({ success: true, data: await reports.dashboard() })
  } catch (err) {
    next(err)
  }
})

router.get('/stock', management, async (_req, res, next) => {
  try {
    res.json({ success: true, data: await reports.stockReport() })
  } catch (err) {
    next(err)
  }
})

router.get('/price-history', management, async (req, res, next) => {
  try {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query)
    res.json({ success: true, data: await reports.priceHistory(limit) })
  } catch (err) {
    next(err)
  }
})

router.get('/customers', management, async (_req, res, next) => {
  try {
    res.json({ success: true, data: await reports.customersReport() })
  } catch (err) {
    next(err)
  }
})

router.get('/sellers', management, async (req, res, next) => {
  try {
    const { month } = z
      .object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() })
      .parse(req.query)
    res.json({ success: true, data: await reports.sellersReport(month) })
  } catch (err) {
    next(err)
  }
})

// ─── Objectifs ───────────────────────────────────────────────────────────────

router.get('/targets', management, async (req, res, next) => {
  try {
    const query = TargetQuerySchema.parse(req.query)
    res.json({ success: true, data: await targets.listTargets(query) })
  } catch (err) {
    next(err)
  }
})

router.put('/targets', management, async (req, res, next) => {
  try {
    const input = UpsertTargetSchema.parse(req.body)
    res.json({ success: true, data: await targets.upsertTarget(input) })
  } catch (err) {
    next(err)
  }
})

router.delete('/targets/:id', management, async (req, res, next) => {
  try {
    await targets.deleteTarget(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router
