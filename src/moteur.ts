/**
 * Moteur de contrôle accessibilité — portage fidèle de MoteurAccessibilite.kt (appli tablette).
 * Mêmes règles, mêmes paliers de tolérance, mêmes statuts : la tablette et le bureau
 * calculent strictement la même chose à partir des mêmes saisies.
 */
import referentielBrut from './data/referentiel_accessibilite.json'

export type Statut = 'C' | 'NC' | 'SO' | 'AE' | 'NV' | 'CT'

export const LIBELLE_STATUT: Record<Statut, string> = {
  C: 'Conforme', NC: 'Non conforme', SO: 'Sans objet', AE: 'À expertiser', NV: 'Non vérifiable', CT: 'Conforme sous tolérance',
}

export interface ConditionRegle { source: string; champ: string; egalBool?: boolean | null; gte?: number | null; lt?: number | null; dans?: number[] | null }
export interface ConditionPalier { param: string; op?: string | null; valeur?: number | null; unite?: string | null; egal?: boolean | null; siConforme?: boolean }

export interface Regle {
  id: string; theme: string; article: string; element: string; point: string; type: string
  unite?: string | null; operateur: string; vmin?: number | null; vmax?: number | null; valeurTexte?: string | null
  condition?: string | null; conditions: ConditionRegle[]; declencheur: string; gravite: string; handicaps: string[]
  mvp: boolean; sequence: string; parent?: string | null; palierOrdre?: number | null; palierParametre?: string | null
  palierCondition?: ConditionPalier | null; obsoleteDepuis?: string | null
}

/** Contexte ERP (accessibilite.diagnostic) */
export interface Diagnostic {
  id: string; projet_id: string; type_erp: string | null; categorie: number | null; mission_service_public: boolean
  enseignement: boolean; restaurant: boolean; contrainte_structurelle: boolean; effectif_etages: number | null
  prestations_hors_rdc: boolean; nb_places_parking: number | null; nb_places_assises: number | null; observations: string | null
  maj_le?: string
}
export interface Element {
  id: string; diagnostic_id: string; niveau_id: string | null; sequence: string; element_type: string; libelle: string
  effectif_local: number | null; travaux_prevus: boolean; contrainte_structurelle: boolean; plusieurs_vantaux?: boolean
  plan_x: number | null; plan_y: number | null; supprime_le: string | null; maj_le?: string
}
export interface Saisie {
  element_id: string; regle_id: string; mesure: number | null; mesure_palier: number | null; palier_bool: boolean | null
  statut_force: Statut | null; commentaire: string | null
}
export interface Contexte { diagnostic: Diagnostic; element: Element; niveauAccessibleFauteuil: boolean | null }

export interface Ligne {
  regle: Regle; saisie: Saisie | null; applicable: boolean; statut: Statut | null
  paliers: Regle[]; palierRetenu: Regle | null; questionPalier: Regle | null
}

const doc = referentielBrut as unknown as { version: string; regles: Regle[] }
export const VERSION_REFERENTIEL = doc.version
export const REGLES: Regle[] = doc.regles
const PAR_ID = new Map(REGLES.map((r) => [r.id, r]))
const PALIERS = new Map<string, Regle[]>()
for (const r of REGLES) if (r.parent) PALIERS.set(r.parent, [...(PALIERS.get(r.parent) ?? []), r])
for (const l of PALIERS.values()) l.sort((a, b) => (a.palierOrdre ?? 0) - (b.palierOrdre ?? 0))

export const regleParId = (id: string) => PAR_ID.get(id)
export const paliersDe = (id: string) => PALIERS.get(id) ?? []

const saisissable = (r: Regle) => r.type !== 'Information' && r.gravite !== 'Information' && !r.parent && !r.obsoleteDepuis

/** Règles d'un type d'élément ; règles « travaux / création » seulement si travaux prévus. */
export function reglesPour(type: string, travauxPrevus: boolean): Regle[] {
  return REGLES.filter((r) => r.element === type && saisissable(r) && (r.declencheur === 'Permanent' || travauxPrevus))
}

const NUMERIQUES = new Set(['≤', '≥', 'entre', '<'])
export const estMesurable = (r: Regle) => r.type === 'Mesurable' && NUMERIQUES.has(r.operateur) && (r.vmin != null || r.vmax != null)

export function evaluerMesure(r: Regle, mesure: number | null | undefined): Statut | null {
  if (mesure == null) return null
  let ok: boolean | null = null
  switch (r.operateur) {
    case '≤': ok = r.vmax != null ? mesure <= r.vmax : null; break
    case '<': ok = r.vmax != null ? mesure < r.vmax : null; break
    case '≥': ok = r.vmin != null ? mesure >= r.vmin : null; break
    case 'entre': ok = r.vmin != null && r.vmax != null ? mesure >= r.vmin && mesure <= r.vmax : null; break
  }
  if (ok == null) return null
  return ok ? 'C' : 'NC'
}

function valeur(source: string, champ: string, ctx: Contexte): unknown {
  if (source === 'erp') {
    switch (champ) {
      case 'restaurant_debit_boissons': return ctx.diagnostic.restaurant
      case 'categorie': return ctx.diagnostic.categorie
      case 'nb_places_parking_public': return ctx.diagnostic.nb_places_parking
      case 'nb_places_assises': return ctx.diagnostic.nb_places_assises
    }
  } else if (source === 'element') {
    switch (champ) {
      case 'effectif_local': return ctx.element.effectif_local
      case 'contrainte_structurelle': return ctx.element.contrainte_structurelle
      case 'plusieurs_vantaux': return ctx.element.plusieurs_vantaux ?? false
    }
  } else if (source === 'niveau' && champ === 'accessible_fauteuil') {
    return ctx.niveauAccessibleFauteuil
  }
  return null
}

/** Donnée de contexte non renseignée : la règle reste applicable (l'agent tranche). */
export function estApplicable(r: Regle, ctx: Contexte): boolean {
  return r.conditions.every((c) => {
    const v = valeur(c.source, c.champ, ctx)
    if (v == null) return true
    if (c.egalBool != null) return v === c.egalBool
    if (c.dans != null) return typeof v === 'number' ? c.dans.includes(Math.trunc(v)) : true
    if (typeof v !== 'number') return true
    return (c.gte == null || v >= c.gte) && (c.lt == null || v < c.lt)
  })
}

export function conditionPalier(p: Regle, s: Saisie | null, ctx?: Contexte): boolean | null {
  const c = p.palierCondition
  if (!c) return true
  switch (c.param) {
    case 'element_contrainte': return (ctx?.element.contrainte_structurelle ?? false) === (c.egal ?? true)
    case 'mesure_palier': {
      const v = s?.mesure_palier
      if (v == null) return null
      if (c.valeur == null) return true
      switch (c.op) {
        case '<=': return v <= c.valeur
        case '<': return v < c.valeur
        case '>=': return v >= c.valeur
        case '>': return v > c.valeur
        default: return true
      }
    }
    case 'palier_bool': return s?.palier_bool == null ? null : s.palier_bool === (c.egal ?? true)
    default: return null
  }
}

interface Evaluation { statut: Statut | null; palierRetenu: Regle | null; questionPalier: Regle | null }

/** Statut : forcé > sans objet > mesure, avec essai des paliers de tolérance (identique à la tablette). */
export function evaluer(r: Regle, s: Saisie | null, ctx: Contexte, paliers: Regle[] = []): Evaluation {
  const force = s?.statut_force ?? null
  if (force && force !== 'NC') return { statut: force, palierRetenu: null, questionPalier: null }
  if (!force && !estApplicable(r, ctx)) return { statut: 'SO', palierRetenu: null, questionPalier: null }
  const base: Statut | null = force ?? (estMesurable(r) ? evaluerMesure(r, s?.mesure) : null)
  if (paliers.length === 0) return { statut: base, palierRetenu: null, questionPalier: null }

  if (base === 'C') {
    const p = paliers.find((x) => x.palierCondition?.siConforme)
    if (!p) return { statut: base, palierRetenu: null, questionPalier: null }
    return conditionPalier(p, s, ctx) === true
      ? { statut: 'CT', palierRetenu: p, questionPalier: p }
      : { statut: base, palierRetenu: null, questionPalier: p }
  }

  let question: Regle | null = null
  let enAttente = false
  for (const p of paliers) {
    if (p.palierCondition?.siConforme) continue
    const mesurable = estMesurable(p)
    if (mesurable && evaluerMesure(p, s?.mesure) !== 'C') continue
    if (!question && p.palierCondition?.param !== 'element_contrainte') question = p
    const c = conditionPalier(p, s, ctx)
    if (c === true) return { statut: 'CT', palierRetenu: p, questionPalier: question ?? p }
    if (c == null && mesurable && !force) enAttente = true
  }
  return enAttente ? { statut: null, palierRetenu: null, questionPalier: question } : { statut: base, palierRetenu: null, questionPalier: question }
}

export function lignes(regles: Regle[], saisies: Saisie[], ctx: Contexte): Ligne[] {
  const parRegle = new Map(saisies.map((s) => [s.regle_id, s]))
  return regles.map((r) => {
    const s = parRegle.get(r.id) ?? null
    const p = paliersDe(r.id)
    const e = evaluer(r, s, ctx, p)
    return { regle: r, saisie: s, applicable: estApplicable(r, ctx), statut: e.statut, paliers: p, palierRetenu: e.palierRetenu, questionPalier: e.questionPalier }
  })
}

export interface Synthese { conformes: number; sousTolerance: number; nonConformes: number; bloquantes: number; aExpertiser: number; aRenseigner: number; sansObjet: number }
export const syntheseVide = (): Synthese => ({ conformes: 0, sousTolerance: 0, nonConformes: 0, bloquantes: 0, aExpertiser: 0, aRenseigner: 0, sansObjet: 0 })

export function synthese(ls: Ligne[]): Synthese {
  const s = syntheseVide()
  for (const l of ls) {
    switch (l.statut) {
      case 'C': s.conformes++; break
      case 'CT': s.sousTolerance++; break
      case 'NC': s.nonConformes++; if (l.regle.gravite === 'Bloquant') s.bloquantes++; break
      case 'AE': case 'NV': s.aExpertiser++; break
      case 'SO': s.sansObjet++; break
      default: s.aRenseigner++
    }
  }
  return s
}
export function ajouter(a: Synthese, b: Synthese): Synthese {
  return {
    conformes: a.conformes + b.conformes, sousTolerance: a.sousTolerance + b.sousTolerance, nonConformes: a.nonConformes + b.nonConformes,
    bloquantes: a.bloquantes + b.bloquantes, aExpertiser: a.aExpertiser + b.aExpertiser, aRenseigner: a.aRenseigner + b.aRenseigner, sansObjet: a.sansObjet + b.sansObjet,
  }
}
export const evalues = (s: Synthese) => s.conformes + s.sousTolerance + s.nonConformes
/** Taux de conformité : les points conformes sous tolérance comptent comme conformes. */
export const taux = (s: Synthese): number | null => (evalues(s) === 0 ? null : Math.trunc((100 * (s.conformes + s.sousTolerance)) / evalues(s)))

const nombre = (d: number) => (Number.isInteger(d) ? String(d) : d.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/** Seuil lisible : « ≤ 6 % », « entre 0,90 et 1,30 m ». */
export function libelleSeuil(r: Regle): string | null {
  const u = r.unite ? ` ${r.unite}` : ''
  if (r.operateur === 'entre' && r.vmin != null && r.vmax != null) return `entre ${nombre(r.vmin)} et ${nombre(r.vmax)}${u}`
  if ((r.operateur === '≤' || r.operateur === '<') && r.vmax != null) return `${r.operateur} ${nombre(r.vmax)}${u}`
  if (r.operateur === '≥' && r.vmin != null) return `≥ ${nombre(r.vmin)}${u}`
  if (r.valeurTexte) return `${r.operateur} ${r.valeurTexte.replace('.', ',')}${u}`
  return null
}

export function libelleMesure(l: Ligne): string {
  const m = l.saisie?.mesure
  if (m == null) return '—'
  return nombre(m) + (l.regle.unite ? ` ${l.regle.unite}` : '')
}

/** Exigences calculées à partir du contexte ERP (identique à la tablette). */
export function exigences(d: Diagnostic): { regleId: string; libelle: string; valeur: string }[] {
  const res: { regleId: string; libelle: string; valeur: string }[] = []
  const n = d.nb_places_parking
  if (n && n > 0) {
    const v = n > 500 ? Math.max(10, Math.ceil(n * 0.02)) : Math.max(1, Math.ceil(n * 0.02))
    res.push({ regleId: 'STA-02', libelle: 'Places de stationnement adaptées', valeur: n > 500 ? `≥ ${v} (arrêté municipal)` : `${v} minimum` })
  }
  const a = d.nb_places_assises
  if (a && a > 0) {
    const v = a <= 50 ? 2 : 2 + Math.ceil((a - 50) / 50)
    res.push({ regleId: 'ASS-01', libelle: 'Emplacements fauteuil (public assis)', valeur: a > 1000 ? `≥ ${Math.max(20, v)} (arrêté municipal)` : `${v} minimum` })
  }
  const seuil = d.enseignement || (d.categorie === 5 && d.contrainte_structurelle) ? 100 : 50
  const asc = d.prestations_hors_rdc ? 'Obligatoire (prestations hors RDC)'
    : d.effectif_etages == null ? null
    : d.effectif_etages >= seuil ? `Obligatoire (effectif étages ≥ ${seuil})` : `Non obligatoire (effectif étages < ${seuil})`
  if (asc) res.push({ regleId: 'ASC-01', libelle: 'Ascenseur', valeur: asc })
  const boucle = d.mission_service_public || d.categorie === 1 || d.categorie === 2
  res.push({ regleId: 'ACU-08', libelle: "Boucle magnétique à l'accueil", valeur: boucle ? 'Obligatoire' : 'Si accueil sonorisé' })
  return res
}

/** Types d'éléments proposés, chacun dans la première séquence où il apparaît (identique à la tablette). */
export const TYPES_ELEMENTS: { type: string; sequence: string }[] = (() => {
  const m = new Map<string, string>()
  for (const r of REGLES) if (saisissable(r)) { const s = m.get(r.element); if (!s || r.sequence < s) m.set(r.element, r.sequence) }
  return [...m].map(([type, sequence]) => ({ type, sequence })).sort((a, b) => a.sequence.localeCompare(b.sequence) || a.type.localeCompare(b.type))
})()
