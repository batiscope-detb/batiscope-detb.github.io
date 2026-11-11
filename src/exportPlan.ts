/** Export PDF d'un plan annoté (A3, orientation selon le plan) avec cartouche et légende. Chargé à la demande. */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib'
import { svgSymbole, type Symbole } from './symboles'

interface Entree {
  image: Blob; largeur: number; hauteur: number
  titre: string; sousTitre: string
  symboles: { symbole: Symbole; nombre: number }[]
  reperes: { numero: number; libelle: string; couleur: string }[]
}

const MM = 72 / 25.4
const VIOLET = rgb(0x2e / 255, 0x2b / 255, 0x57 / 255)
const GRIS = rgb(0x55 / 255, 0x53 / 255, 0x6e / 255)

/** Les polices standard du PDF ne connaissent que le jeu WinAnsi : on remplace le reste. */
const propre = (t: string) => t.replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[^\u0000-ÿŒœ‘’“”–—…€]/g, '?')

function couper(t: string, police: PDFFont, taille: number, largeur: number): string {
  let s = propre(t)
  if (police.widthOfTextAtSize(s, taille) <= largeur) return s
  while (s.length > 1 && police.widthOfTextAtSize(s + '…', taille) > largeur) s = s.slice(0, -1)
  return s + '…'
}

async function iconePng(s: Symbole): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="96" height="96">${svgSymbole(s, null)}</svg>`
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('Icône illisible')); img.src = url })
    const c = document.createElement('canvas'); c.width = 96; c.height = 96
    c.getContext('2d')!.drawImage(img, 0, 0, 96, 96)
    const b = await new Promise<Blob>((ok, ko) => c.toBlob((x) => (x ? ok(x) : ko(new Error('Icône illisible'))), 'image/png'))
    return new Uint8Array(await b.arrayBuffer())
  } finally { URL.revokeObjectURL(url) }
}

export async function exporterPlanPdf(e: Entree): Promise<Blob> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Plan — ${e.titre} — ${e.sousTitre}`)
  doc.setCreator('Relevés DETB — appli bureau')
  const police = await doc.embedFont(StandardFonts.Helvetica)
  const gras = await doc.embedFont(StandardFonts.HelveticaBold)
  const paysage = e.largeur >= e.hauteur
  const [L, H] = paysage ? [420 * MM, 297 * MM] : [297 * MM, 420 * MM]
  const page = doc.addPage([L, H])
  const marge = 10 * MM
  const avecLegende = e.symboles.length > 0 || e.reperes.length > 0
  const largeurLegende = avecLegende ? (paysage ? 70 * MM : 0) : 0
  const hauteurLegendeBas = avecLegende && !paysage ? 60 * MM : 0
  const hautCartouche = 16 * MM

  // Cartouche
  page.drawText(couper(e.titre, gras, 16, L - 2 * marge - 60 * MM), { x: marge, y: H - marge - 14, size: 16, font: gras, color: VIOLET })
  page.drawText(couper(e.sousTitre, police, 10, L - 2 * marge - 60 * MM), { x: marge, y: H - marge - 28, size: 10, font: police, color: GRIS })
  const date = `Édité le ${new Date().toLocaleDateString('fr-FR')} — Direction Études et Travaux Bâtiments`
  page.drawText(propre(date), { x: L - marge - police.widthOfTextAtSize(propre(date), 8), y: H - marge - 14, size: 8, font: police, color: GRIS })
  page.drawLine({ start: { x: marge, y: H - marge - hautCartouche + 8 }, end: { x: L - marge, y: H - marge - hautCartouche + 8 }, thickness: 0.8, color: VIOLET })

  // Plan, ajusté dans la zone disponible
  const plan = await doc.embedPng(new Uint8Array(await e.image.arrayBuffer()))
  const zx = marge, zy = marge + hauteurLegendeBas
  const zl = L - 2 * marge - (largeurLegende ? largeurLegende + 6 * MM : 0)
  const zh = H - 2 * marge - hautCartouche - hauteurLegendeBas
  const k = Math.min(zl / e.largeur, zh / e.hauteur)
  page.drawImage(plan, { x: zx + (zl - e.largeur * k) / 2, y: zy + (zh - e.hauteur * k) / 2, width: e.largeur * k, height: e.hauteur * k })

  if (!avecLegende) return new Blob([await doc.save()], { type: 'application/pdf' })

  // Légende : à droite (paysage) ou en bas (portrait), en colonnes
  const lx0 = paysage ? L - marge - largeurLegende : marge
  const ly0 = paysage ? H - marge - hautCartouche : marge + hauteurLegendeBas - 4 * MM
  const colonne = paysage ? largeurLegende : 68 * MM
  const basMin = marge
  let x = lx0, y = ly0
  const ligne = 13
  const suivante = () => {
    y -= ligne
    if (y < basMin + 4) { x += colonne; y = ly0 - ligne * 1.6 }
  }
  page.drawText('Légende', { x, y: y - 10, size: 11, font: gras, color: VIOLET }); y -= ligne * 1.6
  const icones = new Map<string, PDFImage>()
  for (const { symbole } of e.symboles) icones.set(symbole.id, await doc.embedPng(await iconePng(symbole)))
  for (const { symbole, nombre } of e.symboles) {
    const ic = icones.get(symbole.id)!
    page.drawImage(ic, { x, y: y - 9, width: 11, height: 11 })
    page.drawText(couper(`${symbole.nom} (${nombre})`, police, 8.5, colonne - 18), { x: x + 15, y: y - 7, size: 8.5, font: police, color: rgb(0.1, 0.1, 0.24) })
    suivante()
  }
  if (e.reperes.length) {
    y -= 4
    page.drawText('Repères des locaux', { x, y: y - 8, size: 9.5, font: gras, color: VIOLET }); suivante()
    for (const r of e.reperes) {
      const c = r.couleur.replace('#', '')
      page.drawCircle({ x: x + 5.5, y: y - 4, size: 5.5, color: rgb(parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255) })
      const n = String(r.numero)
      page.drawText(n, { x: x + 5.5 - gras.widthOfTextAtSize(n, 6) / 2, y: y - 6, size: 6, font: gras, color: rgb(1, 1, 1) })
      page.drawText(couper(r.libelle, police, 8.5, colonne - 18), { x: x + 15, y: y - 7, size: 8.5, font: police, color: rgb(0.1, 0.1, 0.24) })
      suivante()
    }
  }
  return new Blob([await doc.save()], { type: 'application/pdf' })
}
