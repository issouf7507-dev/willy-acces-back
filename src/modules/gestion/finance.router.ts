import { Router } from 'express'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import * as service from './finance.service.js'
import {
  ClosingParamSchema,
  CreateExpenseSchema,
  ExpenseQuerySchema,
  UpdateExpenseSchema,
  UpsertClosingSchema,
} from './finance.types.js'

const router = Router()

router.use(authenticate)

/**
 * Les dépenses du jour se règlent au comptoir — un taxi, des sachets, la
 * monnaie d'appoint — et personne ne monte au bureau pour les noter. Le
 * VENDEUR est donc admis sur `/expenses`, le service le bornant ensuite à sa
 * boutique et à la journée en cours.
 */
const counter = requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR')

/** Corriger une dépense déjà saisie relève du bureau, pas du comptoir. */
const admin = requireRole('SUPER_ADMIN', 'ADMIN')

/**
 * Le bilan mensuel dit ce que l'entreprise gagne et comment l'argent se
 * partage : il ne sort pas du SUPER_ADMIN, en lecture comme en écriture.
 */
const owner = requireRole('SUPER_ADMIN')

// ─── Dépenses annexes ────────────────────────────────────────────────────────

router.get('/expenses', counter, async (req, res, next) => {
  try {
    const query = ExpenseQuerySchema.parse(req.query)
    res.json({ success: true, data: await service.listExpenses(query, req.user!) })
  } catch (err) {
    next(err)
  }
})

router.post('/expenses', counter, async (req, res, next) => {
  try {
    const input = CreateExpenseSchema.parse(req.body)
    res.status(201).json({ success: true, data: await service.createExpense(input, req.user!) })
  } catch (err) {
    next(err)
  }
})

router.patch('/expenses/:id', admin, async (req, res, next) => {
  try {
    const input = UpdateExpenseSchema.parse(req.body)
    res.json({ success: true, data: await service.updateExpense(String(req.params.id), input) })
  } catch (err) {
    next(err)
  }
})

router.delete('/expenses/:id', counter, async (req, res, next) => {
  try {
    await service.deleteExpense(String(req.params.id), req.user!)
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

// ─── Bilan mensuel ───────────────────────────────────────────────────────────

router.get('/closings', owner, async (_req, res, next) => {
  try {
    res.json({ success: true, data: await service.listBalances() })
  } catch (err) {
    next(err)
  }
})

router.get('/closings/:month', owner, async (req, res, next) => {
  try {
    const { month } = ClosingParamSchema.parse(req.params)
    res.json({ success: true, data: await service.getBalance(month) })
  } catch (err) {
    next(err)
  }
})

router.put('/closings/:month', owner, async (req, res, next) => {
  try {
    const { month } = ClosingParamSchema.parse(req.params)
    const input = UpsertClosingSchema.parse(req.body)
    res.json({ success: true, data: await service.upsertClosing(month, input) })
  } catch (err) {
    next(err)
  }
})

router.delete('/closings/:month', owner, async (req, res, next) => {
  try {
    const { month } = ClosingParamSchema.parse(req.params)
    await service.deleteClosing(month)
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router
