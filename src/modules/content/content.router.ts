import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

// ─── Carousel ────────────────────────────────────────────────────────────────

const SlideSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  imageUrl: z.string().url(),
  linkUrl: z.string().optional(),
  altText: z.string().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

router.get('/carousel', async (req, res, next) => {
  try {
    const all = req.query.all === 'true'
    const slides = await prisma.carouselSlide.findMany({
      where: all ? undefined : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    res.json({ success: true, data: slides })
  } catch (err) {
    next(err)
  }
})

router.post('/carousel', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = SlideSchema.parse(req.body)
    const slide = await prisma.carouselSlide.create({ data })
    res.status(201).json({ success: true, data: slide })
  } catch (err) {
    next(err)
  }
})

router.patch('/carousel/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = SlideSchema.partial().parse(req.body)
    const slide = await prisma.carouselSlide.update({ where: { id: String(req.params.id) }, data })
    res.json({ success: true, data: slide })
  } catch (err) {
    next(err)
  }
})

router.delete('/carousel/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.carouselSlide.delete({ where: { id: String(req.params.id) } })
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

// ─── Accordion ───────────────────────────────────────────────────────────────

const AccordionSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

router.get('/accordion', async (req, res, next) => {
  try {
    const all = req.query.all === 'true'
    const items = await prisma.accordionItem.findMany({
      where: all ? undefined : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    res.json({ success: true, data: items })
  } catch (err) {
    next(err)
  }
})

router.post('/accordion', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = AccordionSchema.parse(req.body)
    const item = await prisma.accordionItem.create({ data })
    res.status(201).json({ success: true, data: item })
  } catch (err) {
    next(err)
  }
})

router.patch('/accordion/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = AccordionSchema.partial().parse(req.body)
    const item = await prisma.accordionItem.update({ where: { id: String(req.params.id) }, data })
    res.json({ success: true, data: item })
  } catch (err) {
    next(err)
  }
})

router.delete('/accordion/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.accordionItem.delete({ where: { id: String(req.params.id) } })
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

// ─── Salon Catalogue ─────────────────────────────────────────────────────────

router.get('/salon', async (req, res, next) => {
  try {
    const all = req.query.all === 'true'
    const catalogues = await prisma.salonCatalogue.findMany({
      where: all ? undefined : { isActive: true },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    })
    res.json({ success: true, data: catalogues })
  } catch (err) {
    next(err)
  }
})

router.post('/salon', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { images = [], ...data } = req.body as { images?: object[]; [k: string]: unknown }
    const catalogue = await prisma.salonCatalogue.create({
      data: {
        title: data.title as string,
        description: data.description as string | undefined,
        isActive: (data.isActive as boolean | undefined) ?? true,
        sortOrder: (data.sortOrder as number | undefined) ?? 0,
        images: { create: images as any[] },
      },
      include: { images: true },
    })
    res.status(201).json({ success: true, data: catalogue })
  } catch (err) {
    next(err)
  }
})

router.delete('/salon/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.salonCatalogue.delete({ where: { id: String(req.params.id) } })
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

// ─── Salon Services (prestations) ────────────────────────────────────────────

const SalonServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  priceFrom: z.number().int().min(0).default(0),
  gradientFrom: z.string().default('from-rose-700'),
  gradientTo: z.string().default('to-rose-950'),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

router.get('/salon-services', async (req, res, next) => {
  try {
    const all = req.query.all === 'true'
    const services = await prisma.salonService.findMany({
      where: all ? undefined : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    res.json({ success: true, data: services })
  } catch (err) {
    next(err)
  }
})

router.post('/salon-services', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = SalonServiceSchema.parse(req.body)
    const service = await prisma.salonService.create({ data })
    res.status(201).json({ success: true, data: service })
  } catch (err) {
    next(err)
  }
})

router.patch('/salon-services/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = SalonServiceSchema.partial().parse(req.body)
    const service = await prisma.salonService.update({ where: { id: String(req.params.id) }, data })
    res.json({ success: true, data: service })
  } catch (err) {
    next(err)
  }
})

router.delete('/salon-services/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.salonService.delete({ where: { id: String(req.params.id) } })
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router
