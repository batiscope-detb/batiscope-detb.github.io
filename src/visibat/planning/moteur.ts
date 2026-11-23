/**
 * Moteur de planning repris de Planibat (même format de fichier, mêmes calculs) :
 * jours ouvrés (week-ends, jours fériés français, fermetures), liens FD / DD / FF avec décalage,
 * tâches récapitulatives, dates au plus tôt / au plus tard, marges et chemin critique.
 *
 * planning = { version, projet: { nom, debut, feries, fermetures }, lots: [{ id, code, nom, entreprise, couleur }],
 *              zones: [{ id, code, nom, couleur }], taches: [{ id, parentId, lotId, zoneId, nom, duree, preds, debutImpose, notes }] }
 */

export type TypeLien = 'FD' | 'DD' | 'FF'
export interface Lien { id: string; type: TypeLien; decalage: number }
export interface Tache { id: string; parentId: string | null; lotId: string | null; zoneId: string | null; nom: string; duree: number; preds: Lien[]; debutImpose: string | null; notes: string }
export interface LotPlanning { id: string; code: string; nom: string; entreprise: string; couleur: string }
export interface Zone { id: string; code: string; nom: string; couleur: string }
export interface Fermeture { debut: string; fin: string; libelle: string }
export interface Planning {
  version: number
  projet: { nom: string; moa?: string; adresse?: string; redacteur?: string; debut: string; feries: boolean; fermetures: Fermeture[] }
  lots: LotPlanning[]; zones: Zone[]; taches: Tache[]
}
export interface Resultat { es: number; ef: number; ls: number; lf: number; marge: number; recap: boolean; critique: boolean; debut: Date; fin: Date }
export interface Calcul { taches: Map<string, Resultat>; boucles: string[]; debutProjet: Date | null; finProjet: Date | null; dureeOuvree: number }

// --- Calendrier ---------------------------------------------------------------------------------
const JOUR = 86400000
export const depuisISO = (iso: string) => { const [a, m, j] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)) }
export const versISO = (d: Date) => d.toISOString().slice(0, 10)
export const ajouterJours = (d: Date, n: number) => new Date(d.getTime() + n * JOUR)

function paques(annee: number): Date {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  return new Date(Date.UTC(annee, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1))
}
const feries = new Map<number, Set<string>>()
export function joursFeries(annee: number): Set<string> {
  if (!feries.has(annee)) {
    const liste = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map((md) => `${annee}-${md}`)
    const p = paques(annee)
    for (const n of [1, 39, 50]) liste.push(versISO(ajouterJours(p, n))) // lundi de Pâques, Ascension, lundi de Pentecôte
    feries.set(annee, new Set(liste))
  }
  return feries.get(annee)!
}
export function estOuvre(d: Date, o: { feries: boolean; fermetures: Fermeture[] }) {
  const j = d.getUTCDay()
  if (j === 0 || j === 6) return false
  const iso = versISO(d)
  if (o.feries && joursFeries(d.getUTCFullYear()).has(iso)) return false
  return !o.fermetures.some((p) => p.debut && p.fin && iso >= p.debut && iso <= p.fin)
}
export function calendrier(debut: string, o: { feries: boolean; fermetures: Fermeture[] }) {
  const jours: Date[] = []
  let curseur = depuisISO(debut)
  const etendre = (n: number) => {
    let garde = 0
    while (jours.length <= n) {
      if (estOuvre(curseur, o)) jours.push(curseur)
      curseur = ajouterJours(curseur, 1)
      if (++garde > 40000) throw new Error('Le calendrier ne contient aucun jour ouvré.')
    }
  }
  return {
    date(i: number) { i = Math.max(0, i); etendre(i); return jours[i] },
    index(iso: string) { const c = depuisISO(iso).getTime(); for (let i = 0; ; i++) { etendre(i); if (jours[i].getTime() >= c) return i } },
  }
}

// --- Prédécesseurs (saisie « 3, 5DD+2, 7FF-1 ») -----------------------------------------------------
const TYPES: Record<string, TypeLien> = { FD: 'FD', FS: 'FD', DD: 'DD', SS: 'DD', FF: 'FF' }
export function analyserPredecesseurs(texte: string) {
  const liens: { num: number; type: TypeLien; decalage: number }[] = [], erreurs: string[] = []
  for (const m0 of String(texte ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*(FD|DD|FF|FS|SS)?\s*([+-]\s*\d+)?\s*j?$/i.exec(m0)
    if (!m) { erreurs.push(m0); continue }
    liens.push({ num: Number(m[1]), type: TYPES[(m[2] || 'FD').toUpperCase()], decalage: m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0 })
  }
  return { liens, erreurs }
}
export function formaterPredecesseurs(preds: Lien[], numParId: Map<string, number>) {
  return preds.filter((l) => numParId.has(l.id))
    .map((l) => `${numParId.get(l.id)}${l.type === 'FD' ? '' : l.type}${l.decalage ? (l.decalage > 0 ? '+' : '') + l.decalage : ''}`).join(', ')
}

// --- Calcul ---------------------------------------------------------------------------------------
export function calculer(planning: Planning): Calcul {
  const { taches, projet } = planning
  const cal = calendrier(projet.debut, { feries: projet.feries, fermetures: projet.fermetures })
  const parId = new Map(taches.map((t) => [t.id, t]))
  const enfants = new Map<string, Tache[]>()
  for (const t of taches) if (t.parentId && parId.has(t.parentId)) enfants.set(t.parentId, [...(enfants.get(t.parentId) ?? []), t])
  const recap = (id: string) => enfants.has(id)
  const entree = (id: string) => (recap(id) ? '>' + id : id)
  const typeVers = (id: string, type: TypeLien): TypeLien => (recap(id) && type === 'FF' ? 'FD' : type)

  const arcs = new Map<string, string[]>(), degre = new Map<string, number>()
  for (const t of taches) for (const n of [t.id, ...(recap(t.id) ? ['>' + t.id] : [])]) { arcs.set(n, []); degre.set(n, 0) }
  const arc = (a: string, b: string) => { arcs.get(a)!.push(b); degre.set(b, degre.get(b)! + 1) }
  const successeurs = new Map<string, { t: Tache; type: TypeLien; decalage: number }[]>(taches.map((t) => [t.id, []]))
  for (const t of taches) {
    for (const l of t.preds) {
      if (!parId.has(l.id)) continue
      arc(l.id, entree(t.id))
      successeurs.get(l.id)!.push({ t, type: typeVers(t.id, l.type), decalage: l.decalage })
    }
    if (t.parentId && parId.has(t.parentId)) { arc('>' + t.parentId, entree(t.id)); arc(t.id, t.parentId) }
  }

  const ordre: string[] = []
  const file = [...degre.keys()].filter((n) => degre.get(n) === 0)
  while (file.length) {
    const n = file.shift()!
    ordre.push(n)
    for (const s of arcs.get(n)!) { degre.set(s, degre.get(s)! - 1); if (degre.get(s) === 0) file.push(s) }
  }
  const dansOrdre = new Set(ordre)
  const boucles = taches.filter((t) => !dansOrdre.has(t.id)).map((t) => t.id)

  const tot = new Map<string, { es: number; ef: number }>()
  const debutAuPlusTot = (t: Tache, d: number) => {
    let es = t.debutImpose ? cal.index(t.debutImpose) : 0
    const parent = t.parentId ? tot.get('>' + t.parentId) : undefined
    if (parent) es = Math.max(es, parent.es)
    for (const l of t.preds) {
      const p = tot.get(l.id)
      if (!p) continue
      const type = typeVers(t.id, l.type)
      if (type === 'FD') es = Math.max(es, p.ef + l.decalage)
      else if (type === 'DD') es = Math.max(es, p.es + l.decalage)
      else es = Math.max(es, p.ef + l.decalage - d)
    }
    return Math.max(es, 0)
  }
  for (const n of ordre) {
    if (n[0] === '>') { const es = debutAuPlusTot(parId.get(n.slice(1))!, 0); tot.set(n, { es, ef: es }) }
    else if (recap(n)) {
      const rs = enfants.get(n)!.map((c) => tot.get(c.id)!).filter(Boolean)
      tot.set(n, { es: Math.min(...rs.map((r) => r.es)), ef: Math.max(...rs.map((r) => r.ef)) })
    } else { const t = parId.get(n)!; const es = debutAuPlusTot(t, t.duree); tot.set(n, { es, ef: es + t.duree }) }
  }
  const planifiees = taches.filter((t) => tot.has(t.id))
  const fin = Math.max(0, ...planifiees.map((t) => tot.get(t.id)!.ef))

  const tard = new Map<string, { ls: number; lf: number }>()
  const debutAuPlusTard = (id: string) => (recap(id) ? tard.get('>' + id)!.ls : tard.get(id)!.ls)
  for (const n of [...ordre].reverse()) {
    if (n[0] === '>') { const ls = Math.min(...enfants.get(n.slice(1))!.filter((c) => tard.has(c.id) || tard.has('>' + c.id)).map((c) => debutAuPlusTard(c.id))); tard.set(n, { ls, lf: ls }); continue }
    const t = parId.get(n)!, r = tot.get(n)!, d = r.ef - r.es
    let lf = fin
    if (t.parentId && tard.has(t.parentId)) lf = Math.min(lf, tard.get(t.parentId)!.lf)
    for (const s of successeurs.get(n)!) {
      if (!tot.has(s.t.id)) continue
      if (s.type === 'FD') lf = Math.min(lf, debutAuPlusTard(s.t.id) - s.decalage)
      else if (s.type === 'DD') lf = Math.min(lf, debutAuPlusTard(s.t.id) - s.decalage + d)
      else lf = Math.min(lf, tard.get(s.t.id)!.lf - s.decalage)
    }
    tard.set(n, { lf, ls: lf - d })
  }

  const res = new Map<string, Resultat>()
  for (const t of planifiees) {
    const r = tot.get(t.id)!, x = tard.get(t.id)!
    const debut = cal.date(r.es)
    res.set(t.id, { es: r.es, ef: r.ef, lf: x.lf, ls: x.ls, marge: x.ls - r.es, recap: recap(t.id), critique: x.ls - r.es <= 0,
      debut, fin: r.ef > r.es ? cal.date(r.ef - 1) : debut })
  }
  const l = [...res.values()]
  return {
    taches: res, boucles,
    debutProjet: l.length ? new Date(Math.min(...l.map((r) => r.debut.getTime()))) : null,
    finProjet: l.length ? new Date(Math.max(...l.map((r) => r.fin.getTime()))) : null,
    dureeOuvree: l.length ? fin - Math.min(...l.map((r) => r.es)) : 0,
  }
}

// --- Arborescence (tableau à plat, chaque tâche suivie de ses sous-tâches) ---------------------------
export const indexer = (taches: Tache[]) => new Map(taches.map((t) => [t.id, t]))
export function niveau(t: Tache, parId: Map<string, Tache>) { let n = 0; for (let p = t.parentId ? parId.get(t.parentId) : undefined; p; p = p.parentId ? parId.get(p.parentId) : undefined) n++; return n }
export function herite(t: Tache, parId: Map<string, Tache>, champ: 'lotId' | 'zoneId'): string | null {
  for (let x: Tache | undefined = t; x; x = x.parentId ? parId.get(x.parentId) : undefined) if (x[champ]) return x[champ]
  return null
}
export function finBloc(taches: Tache[], i: number) {
  const ids = new Set([taches[i].id]); let j = i + 1
  while (j < taches.length && taches[j].parentId && ids.has(taches[j].parentId!)) ids.add(taches[j++].id)
  return j
}
export function reordonner(taches: Tache[]): Tache[] {
  const parId = indexer(taches)
  for (const t of taches) {
    if (t.parentId && !parId.has(t.parentId)) t.parentId = null
    const vus = new Set([t.id])
    for (let p = t.parentId ? parId.get(t.parentId) : undefined; p; p = p.parentId ? parId.get(p.parentId) : undefined) {
      if (vus.has(p.id)) { t.parentId = null; break }
      vus.add(p.id)
    }
  }
  const enf = new Map<string, Tache[]>()
  for (const t of taches) if (t.parentId) enf.set(t.parentId, [...(enf.get(t.parentId) ?? []), t])
  const res: Tache[] = []
  const visiter = (t: Tache) => { res.push(t); (enf.get(t.id) ?? []).forEach(visiter) }
  taches.filter((t) => !t.parentId).forEach(visiter)
  return res
}
function deplacerBloc(taches: Tache[], id: string, cibleId: string, position: 'avant' | 'apres' | 'dans') {
  const i = taches.findIndex((t) => t.id === id)
  const bloc = taches.slice(i, finBloc(taches, i))
  if (bloc.some((t) => t.id === cibleId)) return false
  const reste = taches.filter((t) => !bloc.includes(t))
  const k = reste.findIndex((t) => t.id === cibleId)
  if (k < 0) return false
  bloc[0].parentId = position === 'dans' ? reste[k].id : reste[k].parentId
  reste.splice(position === 'avant' ? k : finBloc(reste, k), 0, ...bloc)
  taches.splice(0, taches.length, ...reste)
  return true
}
const soeurs = (taches: Tache[], t: Tache) => taches.filter((x) => x.parentId === t.parentId)
export function indenter(taches: Tache[], id: string) { const t = taches.find((x) => x.id === id)!; const s = soeurs(taches, t); const p = s[s.indexOf(t) - 1]; if (!p) return false; t.parentId = p.id; return true }
export function desindenter(taches: Tache[], id: string) { const t = taches.find((x) => x.id === id); return t?.parentId ? deplacerBloc(taches, id, t.parentId, 'apres') : false }
export function monter(taches: Tache[], id: string) { const t = taches.find((x) => x.id === id)!; const s = soeurs(taches, t); const p = s[s.indexOf(t) - 1]; return p ? deplacerBloc(taches, id, p.id, 'avant') : false }
export function descendre(taches: Tache[], id: string) { const t = taches.find((x) => x.id === id)!; const s = soeurs(taches, t); const n = s[s.indexOf(t) + 1]; return n ? deplacerBloc(taches, id, n.id, 'apres') : false }
export function supprimerBloc(taches: Tache[], id: string) {
  const i = taches.findIndex((t) => t.id === id)
  const ids = new Set(taches.slice(i, finBloc(taches, i)).map((t) => t.id))
  const reste = taches.filter((t) => !ids.has(t.id))
  reste.forEach((t) => { t.preds = t.preds.filter((l) => !ids.has(l.id)) })
  taches.splice(0, taches.length, ...reste)
}

// --- Création et lecture d'un fichier Planibat ----------------------------------------------------------
export const COULEURS = ['#8d6e63', '#e57373', '#90a4ae', '#a1887f', '#4db6ac', '#64b5f6', '#ba68c8', '#ffb74d', '#fdd835', '#4fc3f7', '#81c784', '#f06292', '#7986cb']
export const nouvelId = (p: string) => p + Math.random().toString(36).slice(2, 10)
const ZONES_TYPES: [string, string, string][] = [['SS', 'Sous-sol', '#8d6e63'], ['RDC', 'Rez-de-chaussée', '#4db6ac'], ['R+1', 'Étage 1', '#64b5f6'], ['R+2', 'Étage 2', '#9575cd'], ['TT', 'Toiture', '#e57373'], ['EXT', 'Extérieurs', '#81c784']]
const ISO = /^\d{4}-\d{2}-\d{2}$/

export function nouveauPlanning(nom: string, debut: string, lots: LotPlanning[]): Planning {
  return {
    version: 2, projet: { nom, debut, feries: true, fermetures: [] }, lots,
    zones: ZONES_TYPES.map(([code, n, couleur]) => ({ id: nouvelId('z'), code, nom: n, couleur })), taches: [],
  }
}

/** Complète et nettoie un planning lu depuis un fichier Planibat ou la base. */
export function normaliser(p: unknown, defaut: Planning): Planning {
  if (!p || typeof p !== 'object') return defaut
  const x = p as Partial<Planning>
  const projet = { ...defaut.projet, ...(x.projet ?? {}) }
  if (!ISO.test(projet.debut)) projet.debut = defaut.projet.debut
  projet.feries = projet.feries !== false
  projet.fermetures = Array.isArray(projet.fermetures) ? projet.fermetures : []
  const lots = (Array.isArray(x.lots) ? x.lots : defaut.lots).map((l, i) => ({ id: l.id || nouvelId('l'), code: String(l.code ?? ''), nom: String(l.nom ?? ''), entreprise: String(l.entreprise ?? ''), couleur: /^#[0-9a-f]{6}$/i.test(l.couleur) ? l.couleur : COULEURS[i % COULEURS.length] }))
  const zones = (Array.isArray(x.zones) ? x.zones : defaut.zones).map((z, i) => ({ id: z.id || nouvelId('z'), code: String(z.code ?? ''), nom: String(z.nom ?? ''), couleur: /^#[0-9a-f]{6}$/i.test(z.couleur) ? z.couleur : COULEURS[(i + 4) % COULEURS.length] }))
  const idsL = new Set(lots.map((l) => l.id)), idsZ = new Set(zones.map((z) => z.id))
  const taches: Tache[] = (Array.isArray(x.taches) ? x.taches : []).map((t) => ({
    id: t.id || nouvelId('t'), parentId: t.parentId || null, nom: String(t.nom ?? ''),
    lotId: t.lotId && idsL.has(t.lotId) ? t.lotId : null, zoneId: t.zoneId && idsZ.has(t.zoneId) ? t.zoneId : null,
    duree: Math.max(0, Math.round(Number(t.duree) || 0)), debutImpose: t.debutImpose && ISO.test(t.debutImpose) ? t.debutImpose : null,
    notes: String(t.notes ?? ''), preds: Array.isArray(t.preds) ? t.preds : [],
  }))
  const idsT = new Set(taches.map((t) => t.id))
  for (const t of taches) t.preds = t.preds.filter((l) => idsT.has(l.id) && l.id !== t.id).map((l) => ({ id: l.id, type: (['FD', 'DD', 'FF'].includes(l.type) ? l.type : 'FD') as TypeLien, decalage: Math.round(Number(l.decalage) || 0) }))
  return { version: 2, projet, lots, zones, taches: reordonner(taches) }
}
