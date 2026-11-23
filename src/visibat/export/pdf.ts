/**
 * Compte rendu de réunion de chantier en PDF (texte vectoriel, sélectionnable), au modèle DETB.
 * Chargé à la demande (pdf-lib). Photos et plans sont intégrés en JPEG.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import type { Contact, Dossier, Observation, Reunion, Statut } from '../donnees'
import { ETATS, ORDRE_CATEGORIES, cumulAbsences, libelleType } from '../regles'
import { nomComplet } from '../composants/FicheContact'
import { calculer, depuisISO, normaliser, nouveauPlanning } from '../planning/moteur'
import { versAnnotation } from '../composants/Plans'
import { imagePlan } from '../../rendrePlan'
import type { Rubrique } from '../organisation'
import type { Reglages } from './reglages'

export interface EntreePdf {
  dossier: Dossier; reunion: Reunion; reglages: Reglages; statuts: Statut[]; contacts: Contact[]
  urls: Map<string, string>; redacteur: string; observations: Observation[]; rubriques: Rubrique[]
  /** Extrait par entreprise : nom affiché sous le titre. */
  destinataire?: string
}

const L = 595.28, H = 841.89, M = 40, LARGEUR = L - 2 * M
const PRUNE = rgb(0x43 / 255, 0x07 / 255, 0x42 / 255), PRUNE_PALE = rgb(0xf1 / 255, 0xe6 / 255, 0xf0 / 255)
const ENCRE = rgb(0.11, 0.106, 0.122), GRIS = rgb(0.36, 0.333, 0.376), FILET = rgb(0.85, 0.85, 0.85), ROUGE = rgb(0.702, 0.149, 0.118)
const hex = (h: string): RGB => { const n = parseInt(h.replace('#', ''), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) }
const fonce = (h: string): RGB => { const n = parseInt(h.replace('#', ''), 16); const k = 0.72; return rgb((((n >> 16) & 255) * k) / 255, (((n >> 8) & 255) * k) / 255, ((n & 255) * k) / 255) }
/** Les polices standard du PDF ne connaissent que le jeu WinAnsi : on remplace le reste. */
const propre = (t: string) => t.replace(/[→]/g, '->').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[☑✓]/g, 'x').replace(/\t/g, ' ').replace(/[^\u0000-ÿŒœ‘’“”–—…€\n]/g, '?')
const date = (iso: string | null | undefined) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR') : ''
const dateHeure = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

async function octets(url: string | undefined): Promise<Uint8Array | null> {
  if (!url) return null
  try { const r = await fetch(url); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null } catch { return null }
}

export async function genererPdf(e: EntreePdf): Promise<Blob> {
  const { dossier, reunion, reglages: r, statuts, contacts, urls } = e
  const op = dossier.operation
  const doc = await PDFDocument.create()
  doc.setTitle(`Réunion de chantier n° ${reunion.numero} — ${op.nom}`); doc.setAuthor(e.redacteur); doc.setCreator('Visibat — DETB')
  const police = await doc.embedFont(StandardFonts.Helvetica), gras = await doc.embedFont(StandardFonts.HelveticaBold), italique = await doc.embedFont(StandardFonts.HelveticaOblique)
  const entete = `RÉUNION DE CHANTIER N° ${reunion.numero} — ${date(reunion.date_reunion)}`
  const prochaine = reunion.prochaine_date ? `Prochaine réunion : ${dateHeure(reunion.prochaine_date)}${reunion.prochaine_lieu ? ` – ${reunion.prochaine_lieu}` : ''}` : ''

  let page!: PDFPage, y = 0
  const pagesCorps: PDFPage[] = []
  function nouvellePage() {
    page = doc.addPage([L, H]); pagesCorps.push(page)
    texte(propre(entete), M, H - 28, 8, gras, GRIS)
    if (prochaine) { const t = propre(prochaine); texte(t, L - M - police.widthOfTextAtSize(t, 8), H - 28, 8, police, ROUGE) }
    page.drawLine({ start: { x: M, y: H - 34 }, end: { x: L - M, y: H - 34 }, thickness: 0.5, color: FILET })
    y = H - 50
  }
  const place = (h: number) => { if (y - h < M + 20) nouvellePage() }
  function texte(t: string, x: number, yy: number, taille: number, f: PDFFont = police, c: RGB = ENCRE) { page.drawText(propre(t), { x, y: yy, size: taille, font: f, color: c }) }
  function lignes(t: string, f: PDFFont, taille: number, largeur: number): string[] {
    const res: string[] = []
    for (const para of propre(t).split('\n')) {
      let ligne = ''
      for (const mot of para.split(/\s+/)) {
        const essai = ligne ? `${ligne} ${mot}` : mot
        if (f.widthOfTextAtSize(essai, taille) <= largeur) { ligne = essai; continue }
        if (ligne) res.push(ligne)
        ligne = mot
        while (f.widthOfTextAtSize(ligne, taille) > largeur && ligne.length > 1) { let k = ligne.length; while (k > 1 && f.widthOfTextAtSize(ligne.slice(0, k), taille) > largeur) k--; res.push(ligne.slice(0, k)); ligne = ligne.slice(k) }
      }
      res.push(ligne)
    }
    return res
  }
  function paragraphe(t: string, x: number, largeur: number, taille = 9.5, f: PDFFont = police, c: RGB = ENCRE, interligne = 1.3) {
    for (const l of lignes(t, f, taille, largeur)) { place(taille * interligne); texte(l, x, y - taille, taille, f, c); y -= taille * interligne }
  }
  function bandeau(t: string) {
    place(30); y -= 6
    page.drawRectangle({ x: M, y: y - 18, width: LARGEUR, height: 18, color: PRUNE_PALE })
    texte(t.toUpperCase(), M + 8, y - 13, 9.5, gras, PRUNE); y -= 24
  }
  const couper = (t: string, f: PDFFont, taille: number, largeur: number) => { let s = propre(t); while (s.length > 1 && f.widthOfTextAtSize(s, taille) > largeur) s = s.slice(0, -2) + '…'; return s }

  // --- Page de garde -------------------------------------------------------------------------------
  if (r.garde) {
    page = doc.addPage([L, H])
    texte('Direction Études et Travaux Bâtiments', M, H - 60, 10, gras, PRUNE)
    texte('Ville de Cherbourg-en-Cotentin', M, H - 74, 10, police, GRIS)
    const titre = `Réunion de chantier n° ${reunion.numero}`
    texte(titre, (L - gras.widthOfTextAtSize(propre(titre), 26)) / 2, H - 260, 26, gras, PRUNE)
    const d = dateHeure(reunion.date_reunion)
    texte(d, (L - police.widthOfTextAtSize(propre(d), 13)) / 2, H - 285, 13, police, ENCRE)
    y = H - 340
    for (const [t, f, taille] of [[op.nom, gras, 15], [op.adresse ?? '', police, 11], [op.objet ?? '', italique, 11], [e.destinataire ? `Extrait pour : ${e.destinataire}` : '', gras, 11]] as [string, PDFFont, number][]) {
      if (!t) continue
      for (const l of lignes(t, f, taille, LARGEUR - 80)) { texte(l, (L - f.widthOfTextAtSize(l, taille)) / 2, y, taille, f); y -= taille * 1.5 }
    }
    if (prochaine) { const t = propre(prochaine); texte(t, (L - gras.widthOfTextAtSize(t, 12)) / 2, 170, 12, gras, ROUGE) }
    texte(`Rédacteur : ${e.redacteur}`, M, 60, 9, police, GRIS)
  }

  nouvellePage()
  if (!r.garde) {
    texte(op.nom, M, y - 14, 14, gras, PRUNE); y -= 20
    if (op.adresse) paragraphe(op.adresse, M, LARGEUR, 9.5, police, GRIS)
    if (op.objet) paragraphe(op.objet, M, LARGEUR, 9.5, italique, GRIS)
    if (e.destinataire) paragraphe(`Extrait pour : ${e.destinataire}`, M, LARGEUR, 10, gras)
    y -= 6
  }

  // --- Intervenants et présences ------------------------------------------------------------------------
  if (r.presences && dossier.intervenants.length) {
    bandeau('Intervenants')
    paragraphe('P présent · E excusé · A absent · N absent non excusé · C convoqué à la prochaine réunion · Abs. nombre d’absences non excusées', M, LARGEUR, 7.5, police, GRIS)
    y -= 2
    const cols = [0, 165, 265, 330, 452, 477, 495]
    for (const cat of ORDRE_CATEGORIES) {
      const liste = dossier.intervenants.filter((i) => i.categorie === cat)
      if (!liste.length) continue
      place(34)
      page.drawRectangle({ x: M, y: y - 14, width: LARGEUR, height: 14, color: rgb(0.96, 0.95, 0.97) })
      ;[libelleType(cat).toUpperCase(), 'Société', 'Téléphone', 'E-mail', 'État', 'C', 'Abs.'].forEach((t, k) => texte(t, M + 3 + cols[k], y - 10, 7, gras, GRIS))
      y -= 16
      for (const i of liste) {
        const c = contacts.find((x) => x.id === i.contact_id)
        const p = dossier.presences.find((x) => x.reunion_id === reunion.id && x.intervenant_id === i.id)
        const lot = dossier.lots.find((l) => l.id === i.lot_id)
        const n = cumulAbsences(dossier.presences, i.id, dossier.reunions, reunion.numero)
        const premiere = [lot ? `${lot.code} ${lot.libelle}` : '', `${nomComplet(c)}${c?.fonction ? ` – ${c.fonction}` : ''}`].filter(Boolean)
        const h = Math.max(13, premiere.length * 9.5 + 4)
        place(h)
        premiere.forEach((t, k) => texte(couper(t, k === premiere.length - 1 ? gras : police, 7.5, 158), M + 3, y - 9 - k * 9.5, 7.5, k === premiere.length - 1 ? gras : police))
        texte(couper(c?.societe ?? '', police, 7.5, 95), M + 3 + cols[1], y - 9, 7.5)
        texte(c?.mobile ?? c?.telephone ?? '', M + 3 + cols[2], y - 9, 7.5)
        texte(couper(c?.email ?? '', police, 7, 117), M + 3 + cols[3], y - 9, 7)
        const et = ETATS.find((x) => x.code === p?.etat)
        if (et) texte(et.code, M + 6 + cols[4], y - 9, 8, gras, hex(et.couleur))
        if (p?.convoque) texte('x', M + 6 + cols[5], y - 9, 8, gras)
        if (n) texte(String(n), M + 6 + cols[6], y - 9, 8, gras, n >= 2 ? ROUGE : ENCRE)
        y -= h
        page.drawLine({ start: { x: M, y }, end: { x: L - M, y }, thickness: 0.4, color: FILET })
      }
      y -= 6
    }
    if (op.debut_travaux || op.objectif_reception) paragraphe(`Calendrier : ${op.debut_travaux ? `début des travaux le ${date(op.debut_travaux)}` : ''}${op.objectif_reception ? ` · objectif de réception le ${date(op.objectif_reception)}` : ''}`, M, LARGEUR, 9, gras)
    if (op.clause_diffusion) { y -= 2; paragraphe(op.clause_diffusion, M, LARGEUR, 8, italique, GRIS) }
  }

  // --- Planning ----------------------------------------------------------------------------------------
  if (r.planning !== 'aucun' && op.planning_actif && op.planning) {
    const pl = normaliser(op.planning, nouveauPlanning(op.nom, op.debut_travaux ?? reunion.date_reunion.slice(0, 10), []))
    const cal = calculer(pl)
    const semaines = r.planning === 'extrait_4_semaines' ? 4 : r.planning === 'extrait_8_semaines' ? 8 : null
    const d0 = semaines ? depuisISO(reunion.date_reunion.slice(0, 10)) : cal.debutProjet
    const d1 = semaines && d0 ? new Date(d0.getTime() + semaines * 7 * 86400000) : cal.finProjet
    const taches = pl.taches.filter((t) => { const x = cal.taches.get(t.id); return x && !x.recap && (!semaines || (x.fin >= d0! && x.debut <= d1!)) })
    bandeau(semaines ? `Planning — ${semaines} semaines à venir` : 'Planning')
    if (!taches.length || !d0 || !d1) paragraphe('Aucune tâche du planning sur la période.', M, LARGEUR, 9, italique, GRIS)
    else {
      const gx = M + 250, gl = LARGEUR - 250, duree = Math.max(1, d1.getTime() - d0.getTime() + 86400000)
      const px = (d: Date) => gx + Math.max(0, Math.min(1, (d.getTime() - d0.getTime()) / duree)) * gl
      for (const t of taches) {
        const x = cal.taches.get(t.id)!
        place(13)
        texte(couper(t.nom, police, 7.5, 150), M + 3, y - 9, 7.5)
        texte(`${x.debut.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} -> ${x.fin.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`, M + 158, y - 9, 7, police, GRIS)
        const lot = pl.lots.find((l) => l.id === (t.lotId ?? pl.taches.find((p) => p.id === t.parentId)?.lotId))
        const a = px(x.debut), b = Math.max(a + 2, px(new Date(x.fin.getTime() + 86400000)))
        if (t.duree === 0) page.drawSvgPath('M 0 -4 L 4 0 L 0 4 L -4 0 Z', { x: a, y: y - 6.5, color: ENCRE })
        else page.drawRectangle({ x: a, y: y - 10, width: b - a, height: 7, color: hex(lot?.couleur ?? '#90a4ae'), borderColor: x.critique ? ROUGE : undefined, borderWidth: x.critique ? 1 : 0 })
        y -= 13
        page.drawLine({ start: { x: M, y }, end: { x: L - M, y }, thickness: 0.3, color: FILET })
      }
      y -= 6
    }
  }

  // --- Observations ------------------------------------------------------------------------------------
  const images = new Map<string, PDFImage | null>()
  const image = async (chemin: string) => {
    if (!images.has(chemin)) { const b = await octets(urls.get(`visibat:${chemin}`)); images.set(chemin, b ? await doc.embedJpg(b).catch(() => null) : null) }
    return images.get(chemin) ?? null
  }
  const photosDe = (o: Observation) => dossier.photos.filter((p) => p.observation_id === o.id)

  if (r.classement === 'mosaique') {
    bandeau('Photos')
    const l2 = (LARGEUR - 12) / 2
    let colonne = 0, hauteurLigne = 0
    for (const o of e.observations) for (const ph of photosDe(o)) {
      const img = await image(ph.storage_path)
      if (!img) continue
      const h = (img.height / img.width) * l2
      const leg = lignes(`${o.numero} — ${o.texte}`, police, 8, l2).slice(0, 3)
      const total = h + leg.length * 10 + 10
      if (colonne === 0) place(total)
      const x = M + colonne * (l2 + 12)
      page.drawImage(img, { x, y: y - h, width: l2, height: h })
      leg.forEach((t, k) => texte(t, x, y - h - 10 - k * 10, 8))
      hauteurLigne = Math.max(hauteurLigne, total)
      if (colonne === 1) { y -= hauteurLigne; hauteurLigne = 0 }
      colonne = 1 - colonne
    }
    if (colonne === 1) y -= hauteurLigne
  } else {
    for (const g of e.rubriques) {
      bandeau(g.titre)
      if (g.sousTitre) paragraphe(g.sousTitre, M + 8, LARGEUR - 8, 7.5, police, GRIS)
      for (const o of g.observations) {
        const s = statuts.find((x) => x.code === o.statut_code)
        const couleur = s?.couleur ?? '#999999'
        const corps = lignes(o.texte, police, 9.5, LARGEUR - 20)
        const charge = dossier.intervenants.find((i) => i.id === o.a_charge_de)
        const cc = contacts.find((x) => x.id === charge?.contact_id)
        const pied = [charge ? `À charge de : ${cc?.societe ?? nomComplet(cc)}` : '', o.echeance ? `Échéance : ${date(o.echeance)}` : '', o.date_intervention ? `Programmée le ${date(o.date_intervention)}` : ''].filter(Boolean).join(' · ')
        const ph = r.photos === 'vignettes' || r.photos === 'grandes' ? photosDe(o) : []
        const hauteurTexte = 16 + corps.length * 12.3 + (pied ? 12 : 0) + 6
        place(Math.min(hauteurTexte, 160))
        let debutBarre = y
        const barre = () => page.drawRectangle({ x: M, y: y - 2, width: 3.5, height: debutBarre - y + 2, color: hex(couleur) })
        const saut = (h: number) => { if (y - h < M + 20) { barre(); nouvellePage(); debutBarre = y } }
        texte(s?.libelle ?? o.statut_code, M + 12, y - 11, 8.5, gras, fonce(couleur))
        const meta = `${o.date_statut ? `depuis le ${date(o.date_statut)}` : ''}${o.cree_le ? `, créée le ${date(o.cree_le)}` : ''}`
        texte(meta, M + 16 + gras.widthOfTextAtSize(propre(s?.libelle ?? ''), 8.5), y - 11, 8, police, GRIS)
        const lnum = gras.widthOfTextAtSize(o.numero, 8) + 8
        page.drawRectangle({ x: L - M - lnum, y: y - 13, width: lnum, height: 12, color: rgb(0.17, 0.153, 0.188) })
        texte(o.numero, L - M - lnum + 4, y - 10, 8, gras, rgb(1, 1, 1))
        y -= 16
        for (const l of corps) { saut(12.3); texte(l, M + 12, y - 9.5, 9.5); y -= 12.3 }
        if (pied) { saut(12); texte(couper(pied, police, 8, LARGEUR - 20), M + 12, y - 9, 8, police, GRIS); y -= 12 }
        barre()
        if (ph.length) {
          const parLigne = r.photos === 'grandes' ? 2 : 4
          const lp = (LARGEUR - 12 - (parLigne - 1) * 8) / parLigne
          let k = 0
          for (const p of ph) {
            const img = await image(p.storage_path)
            if (!img) continue
            const hp = Math.min(lp * 0.75, (img.height / img.width) * lp)
            if (k % parLigne === 0) { place(hp + 6); y -= 4 }
            page.drawImage(img, { x: M + 12 + (k % parLigne) * (lp + 8), y: y - hp, width: lp, height: hp })
            if (k % parLigne === parLigne - 1) y -= hp + 2
            k++
            if (k % parLigne !== 0 && k === ph.length) y -= hp + 2
          }
        }
        y -= 8
      }
    }
    if (r.photos === 'mosaique') {
      const toutes = e.observations.flatMap((o) => photosDe(o).map((p) => ({ o, p })))
      if (toutes.length) {
        nouvellePage(); bandeau('Planche de photos')
        const l2 = (LARGEUR - 12) / 2
        let colonne = 0, hl = 0
        for (const { o, p } of toutes) {
          const img = await image(p.storage_path)
          if (!img) continue
          const h = Math.min(l2 * 0.75, (img.height / img.width) * l2)
          if (colonne === 0) place(h + 22)
          const x = M + colonne * (l2 + 12)
          page.drawImage(img, { x, y: y - h, width: l2, height: h })
          texte(couper(`${o.numero} — ${o.texte}`, police, 8, l2), x, y - h - 10, 8)
          hl = Math.max(hl, h + 18)
          if (colonne === 1) { y -= hl; hl = 0 }
          colonne = 1 - colonne
        }
      }
    }
  }

  // --- Plans avec pastilles et annotations ---------------------------------------------------------------
  if (r.plans) {
    const ids = new Set(e.observations.map((o) => o.id))
    for (const pl of dossier.plans) {
      const pos = dossier.positions.filter((p) => p.plan_id === pl.id && ids.has(p.observation_id))
      const anns = dossier.annotations.filter((a) => a.plan_id === pl.id).map(versAnnotation)
      const u = urls.get(`${pl.bucket}:${pl.storage_path}`)
      if ((!pos.length && !anns.length) || !u) continue
      try {
        const reperes = pos.map((p) => { const o = e.observations.find((x) => x.id === p.observation_id)!; return { id: p.id, x: p.x, y: p.y, texte: o.numero, titre: o.numero, couleur: statuts.find((s) => s.code === o.statut_code)?.couleur } })
        const rendu = await imagePlan(u, pl.page_index, reperes, anns, 2200)
        const b = await octets(rendu.url); URL.revokeObjectURL(rendu.url)
        if (!b) continue
        const img = await doc.embedJpg(b)
        nouvellePage(); bandeau(`Plan : ${pl.libelle}`)
        const k = Math.min(LARGEUR / img.width, (y - M - 20) / img.height)
        page.drawImage(img, { x: M + (LARGEUR - img.width * k) / 2, y: y - img.height * k, width: img.width * k, height: img.height * k })
        y -= img.height * k + 10
      } catch { /* plan illisible : on continue sans lui */ }
    }
  }

  // Pied de page : numérotation
  const total = pagesCorps.length
  pagesCorps.forEach((p, i) => {
    const t = `${i + 1}/${total}`
    p.drawText(t, { x: (L - police.widthOfTextAtSize(t, 8)) / 2, y: 22, size: 8, font: police, color: GRIS })
    p.drawText('Visibat — DETB, Ville de Cherbourg-en-Cotentin', { x: M, y: 22, size: 7, font: police, color: GRIS })
  })
  return new Blob([await doc.save()], { type: 'application/pdf' })
}
