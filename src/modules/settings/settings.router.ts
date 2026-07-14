import { Router } from 'express'
import { type Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const settings = await prisma.storeSetting.findMany()
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))
    res.json({ success: true, data: map })
  } catch (err) {
    next(err)
  }
})

router.put('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const entries = Object.entries(req.body as Record<string, Prisma.InputJsonValue>)
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.storeSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    )
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router
