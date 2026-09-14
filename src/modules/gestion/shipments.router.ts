import { Router } from 'express'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import * as service from './shipments.service.js'
import {
  CreateShipmentItemSchema,
  CreateShipmentSchema,
  ShipmentQuerySchema,
  UpdateShipmentItemSchema,
  UpdateShipmentSchema,
} from './shipments.types.js'

const router = Router()

/**
 * Les arrivages relèvent des achats, pas du comptoir : ils exposent les prix
 * fournisseur et les marges. Réservés aux administrateurs, en lecture
 * comme en écriture.
 */
router.use(authenticate, requireRole('SUPER_ADMIN', 'ADMIN'))

router.get('/', async (req, res, next) => {
  try {
    const query = ShipmentQuerySchema.parse(req.query)
    res.json({ success: true, data: await service.listShipments(query) })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.getShipment(String(req.params.id)) })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const input = CreateShipmentSchema.parse(req.body)
    res.status(201).json({ success: true, data: await service.createShipment(input) })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const input = UpdateShipmentSchema.parse(req.body)
    res.json({ success: true, data: await service.updateShipment(String(req.params.id), input) })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await service.deleteShipment(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

// ─── Lignes de l'arrivage ────────────────────────────────────────────────────

router.post('/:id/items', async (req, res, next) => {
  try {
    const input = CreateShipmentItemSchema.parse(req.body)
    const shipment = await service.addItem(String(req.params.id), input)
    res.status(201).json({ success: true, data: shipment })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/items/:itemId', async (req, res, next) => {
  try {
    const input = UpdateShipmentItemSchema.parse(req.body)
    const shipment = await service.updateItem(
      String(req.params.id),
      String(req.params.itemId),
      input,
    )
    res.json({ success: true, data: shipment })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    const shipment = await service.removeItem(String(req.params.id), String(req.params.itemId))
    res.json({ success: true, data: shipment })
  } catch (err) {
    next(err)
  }
})

// ─── Cycle de vie ────────────────────────────────────────────────────────────

router.post('/:id/receive', async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.receiveShipment(String(req.params.id)) })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/cancel', async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.cancelShipment(String(req.params.id)) })
  } catch (err) {
    next(err)
  }
})

export default router
