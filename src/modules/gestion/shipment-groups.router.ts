import { Router } from 'express'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import * as service from './shipment-groups.service.js'
import {
  CreateShipmentGroupSchema,
  ShipmentGroupQuerySchema,
  UpdateShipmentGroupSchema,
} from './shipments.types.js'

const router = Router()

/**
 * Les groupes sont les livraisons d'un arrivage : comme lui, ils exposent les
 * prix fournisseur. Réservés aux administrateurs.
 */
router.use(authenticate, requireRole('SUPER_ADMIN', 'ADMIN'))

router.get('/', async (req, res, next) => {
  try {
    const query = ShipmentGroupQuerySchema.parse(req.query)
    res.json({ success: true, data: await service.listGroups(query) })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.getGroup(String(req.params.id)) })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const input = CreateShipmentGroupSchema.parse(req.body)
    res.status(201).json({ success: true, data: await service.createGroup(input) })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const input = UpdateShipmentGroupSchema.parse(req.body)
    res.json({ success: true, data: await service.updateGroup(String(req.params.id), input) })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await service.removeGroup(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/receive', async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.receiveGroup(String(req.params.id)) })
  } catch (err) {
    next(err)
  }
})

export default router
