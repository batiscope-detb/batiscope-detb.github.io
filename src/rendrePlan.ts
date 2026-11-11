/** Rendu hors écran d'un plan annoté (page PDF + symboles + repères) en image, pour les rapports. */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as pdfjs from 'pdfjs-dist'
import urlTravailleur from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Annotation } from './donnees'
import type { Repere } from './composants/Plan'
import { CalqueAnnotations } from './composants/Annotations'
import { FAMILLES } from './symboles'

pdfjs.GlobalWorkerOptions.workerSrc = urlTravailleur

export interface ImagePlan { url: string; largeur: number; hauteur: number }

export async function imagePlan(urlPdf: string, page: number, reperes: Repere[], annotations: Annotation[], largeurMax = 1800): Promise<ImagePlan> {
  const pdf = await pdfjs.getDocument({ url: urlPdf }).promise
  try {
    const p = await pdf.getPage(Math.min(Math.max(1, page + 1), pdf.numPages))
    const base = p.getViewport({ scale: 1 })
    const vue = p.getViewport({ scale: Math.min(3, largeurMax / base.width) })
    const c = document.createElement('canvas')
    c.width = Math.round(vue.width); c.height = Math.round(vue.height)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    await p.render({ canvasContext: ctx, viewport: vue }).promise

    if (annotations.length) {
      const svg = renderToStaticMarkup(createElement(CalqueAnnotations, {
        ratio: c.height / c.width, annotations, visibles: new Set(FAMILLES.map((f) => f.id)), outil: null, edition: false, selection: null,
        creer: () => {}, deplacer: () => {}, choisir: () => {},
      })).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" `)
      const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      try {
        const img = new Image()
        await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('Calque illisible')); img.src = u })
        ctx.drawImage(img, 0, 0, c.width, c.height)
      } finally { URL.revokeObjectURL(u) }
    }

    const r = Math.max(11, c.width / 95)
    for (const rp of reperes) {
      const x = rp.x * c.width, y = rp.y * c.height
      ctx.beginPath()
      if (rp.acc) ctx.rect(x - r, y - r, r * 2, r * 2); else ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = rp.acc ? '#C88A12' : rp.couleur ?? '#2E2B57'; ctx.fill()
      ctx.lineWidth = r / 5; ctx.strokeStyle = '#fff'; ctx.stroke()
      ctx.fillStyle = rp.acc ? '#1B1B3D' : '#fff'; ctx.font = `700 ${r}px Inter, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(rp.texte, x, y + 1)
    }
    const blob = await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Rendu du plan impossible'))), 'image/jpeg', 0.9))
    return { url: URL.createObjectURL(blob), largeur: c.width, hauteur: c.height }
  } finally {
    await pdf.destroy()
  }
}
