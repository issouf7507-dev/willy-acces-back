import { Router } from 'express'
import { CreateQuoteSchema, UpdateQuoteSchema, QuoteQuerySchema } from './quotes.types.js'
import * as quotesService from './quotes.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

// Public — soumission du formulaire de devis salon
router.post('/', async (req, res, next) => {
  try {
    const input = CreateQuoteSchema.parse(req.body)
    const quote = await quotesService.createQuote(input)
    res.status(201).json({ success: true, data: quote })
  } catch (err) {
    next(err)
  }
})

// Admin — gestion des demandes
router.get('/', authenticate, requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res, next) => {
  try {
    const query = QuoteQuerySchema.parse(req.query)
    const result = await quotesService.listQuotes(query)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', authenticate, requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res, next) => {
  try {
    const quote = await quotesService.getQuote(String(req.params.id))
    res.json({ success: true, data: quote })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = UpdateQuoteSchema.parse(req.body)
    const quote = await quotesService.updateQuote(String(req.params.id), input)
    res.json({ success: true, data: quote })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await quotesService.deleteQuote(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router
