import { Router } from 'express'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import * as service from './transfers.service.js'
import { CreateTransferSchema, TransferQuerySchema } from './transfers.types.js'

const router = Router()

/**
 * Déplacer de la marchandise entre boutiques engage le stock des deux : c'est
 * un geste d'administration, pas de comptoir.
 */
router.use(authenticate, requireRole('SUPER_ADMIN', 'ADMIN'))

router.get('/', async (req, res, next) => {
  try {
    const query = TransferQuerySchema.parse(req.query)
    res.json({ success: true, data: await service.listTransfers(query) })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const input = CreateTransferSchema.parse(req.body)
    const transfer = await service.createTransfer(input, req.user!.userId)
    res.status(201).json({ success: true, data: transfer })
  } catch (err) {
    next(err)
  }
})

export default router
