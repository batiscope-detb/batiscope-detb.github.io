/**
 * Réglages d'un export de compte rendu (modèles pré-configurés, de groupe ou personnels, « roue crantée »),
 * et préparation du contenu : observations retenues et regroupement en rubriques.
 */
import type { Contact, Dossier, Observation, Reunion, Statut } from '../donnees'
import { observationsVisibles, rubriques, trierRubrique, type Rubrique } from '../organisation'
import { comparerNumeros } from '../regles'

export interface Reglages {
  remarques: 'courante_et_non_levees' | 'courante' | 'ouvertes'
  classement: 'intervenant_puis_lot' | 'lot' | 'plan' | 'statut' | 'mosaique'
  planning: 'aucun' | 'extrait_4_semaines' | 'extrait_8_semaines' | 'complet'
  photos: 'vignettes' | 'grandes' | 'aucune' | 'mosaique'
  garde: boolean; presences: boolean; generales: boolean; plans: boolean; memoire: boolean
  par_entreprise: boolean
  /** Jeu de couleurs du document (en-têtes, bandeaux) ; « nb » = noir et blanc, statuts en niveaux de gris. */
  palette: 'prune' | 'bleu' | 'vert' | 'ardoise' | 'bordeaux' | 'nb'
}
export const REGLAGES_DEFAUT: Reglages = {
  remarques: 'courante_et_non_levees', classement: 'intervenant_puis_lot', planning: 'aucun', photos: 'vignettes',
  garde: true, presences: true, generales: true, plans: true, memoire: true, par_entreprise: false, palette: 'prune',
}
/** Complète des réglages enregistrés (anciens modèles, champs manquants). */
export function completer(r: unknown): Reglages {
  const x = (r && typeof r === 'object' ? r : {}) as Partial<Reglages> & { planning?: string }
  const palette = x.palette && x.palette in PALETTES ? x.palette : 'prune'
  return { ...REGLAGES_DEFAUT, ...x, palette, planning: (x.planning === 'extrait_4_semaines' || x.planning === 'extrait_8_semaines' || x.planning === 'complet') ? x.planning : 'aucun' } as Reglages
}

/** Couleurs des documents : teinte des titres et bandeaux, et fond pâle des bandeaux. */
export const PALETTES: Record<Reglages['palette'], { nom: string; fonce: string; pale: string }> = {
  prune: { nom: 'Prune (Ville de Cherbourg)', fonce: '#430742', pale: '#f1e6f0' },
  bleu: { nom: 'Bleu', fonce: '#1f4e79', pale: '#e3ecf6' },
  vert: { nom: 'Vert', fonce: '#2e6b3f', pale: '#e4f1e7' },
  ardoise: { nom: 'Ardoise', fonce: '#37474f', pale: '#e8edef' },
  bordeaux: { nom: 'Bordeaux', fonce: '#7a1f2b', pale: '#f6e4e6' },
  nb: { nom: 'Noir et blanc', fonce: '#000000', pale: '#e6e6e6' },
}
/** En noir et blanc, une couleur de statut devient un gris de même clarté. */
export function couleurDoc(hex: string, r: Pick<Reglages, 'palette'>): string {
  if (r.palette !== 'nb') return hex
  const n = parseInt(hex.replace('#', ''), 16)
  const g = Math.round(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255))
  const v = Math.min(150, g).toString(16).padStart(2, '0')
  return `#${v}${v}${v}`
}

export const LIBELLES = {
  remarques: { courante_et_non_levees: 'Visite courante et remarques non levées des visites précédentes', courante: 'Visite courante seulement', ouvertes: 'Points ouverts seulement (sans les soldés)' },
  classement: { intervenant_puis_lot: 'Par intervenant puis par lot', lot: 'Par lot', plan: 'Par plan', statut: 'Par statut', mosaique: 'Mosaïque de photos' },
  planning: { aucun: 'Ne pas joindre', extrait_4_semaines: 'Extrait : 4 semaines à venir', extrait_8_semaines: 'Extrait : 8 semaines à venir', complet: 'Planning complet' },
  photos: { vignettes: 'Vignettes sous chaque remarque', grandes: 'Grand format', aucune: 'Aucune', mosaique: 'Planche de photos en fin de CR' },
} as const

/** Observations retenues pour l'export. */
export function observationsExport(dossier: Dossier, reunion: Reunion, statuts: Statut[], r: Reglages): Observation[] {
  const soldant = new Set(statuts.filter((s) => s.soldant).map((s) => s.code))
  let obs = observationsVisibles(dossier, reunion, statuts)
  if (r.remarques === 'courante') obs = obs.filter((o) => o.reunion_id === reunion.id || dossier.suivis.some((s) => s.observation_id === o.id && s.reunion_id === reunion.id))
  if (r.remarques === 'ouvertes') obs = obs.filter((o) => !soldant.has(o.statut_code) && o.statut_code !== 'memoire')
  if (!r.memoire) obs = obs.filter((o) => o.statut_code !== 'memoire')
  if (!r.generales) obs = obs.filter((o) => o.rubrique !== 'generale')
  return obs
}

/** Rubriques selon le classement choisi. */
export function regrouper(dossier: Dossier, obs: Observation[], contacts: Contact[], statuts: Statut[], r: Reglages): Rubrique[] {
  if (r.classement === 'statut') return statuts.map((s) => ({ cle: `s-${s.code}`, titre: s.libelle, observations: obs.filter((o) => o.statut_code === s.code) })).filter((g) => g.observations.length)
  if (r.classement === 'plan') {
    const res: Rubrique[] = dossier.plans.map((p) => ({ cle: `p-${p.id}`, titre: `Plan : ${p.libelle}`, observations: trierRubrique(obs.filter((o) => dossier.positions.some((x) => x.observation_id === o.id && x.plan_id === p.id))) }))
    const sans = obs.filter((o) => !dossier.positions.some((x) => x.observation_id === o.id))
    if (sans.length) res.push({ cle: 'sans-plan', titre: 'Observations sans position sur plan', observations: sans })
    return res.filter((g) => g.observations.length)
  }
  if (r.classement === 'lot') {
    const lotsDe = (o: Observation) => dossier.obsLots.filter((x) => x.observation_id === o.id).map((x) => x.lot_id)
    const res: Rubrique[] = [{ cle: 'generales', titre: 'Remarques générales', observations: trierRubrique(obs.filter((o) => o.rubrique === 'generale')) }]
    for (const l of dossier.lots) res.push({ cle: `l-${l.id}`, titre: `${l.code} ${l.libelle}`, lotId: l.id, observations: trierRubrique(obs.filter((o) => o.rubrique !== 'generale' && lotsDe(o).includes(l.id))) })
    const sans = obs.filter((o) => o.rubrique !== 'generale' && lotsDe(o).length === 0)
    if (sans.length) res.push({ cle: 'autres', titre: 'Autres observations', observations: sans })
    return res.filter((g) => g.observations.length)
  }
  if (r.classement === 'mosaique') return [{ cle: 'mosaique', titre: 'Photos', observations: [...obs].sort((a, b) => comparerNumeros(a.numero, b.numero)) }]
  return rubriques(dossier, obs, contacts).filter((g) => g.observations.length)
}

/** Entreprises (intervenants de catégorie « entreprise ») et leurs observations, pour les extraits par entreprise. */
export function parEntreprise(dossier: Dossier, obs: Observation[], contacts: Contact[]) {
  const societes = new Map<string, { nom: string; intervenants: string[]; lots: Set<string>; emails: string[] }>()
  for (const i of dossier.intervenants.filter((x) => x.categorie === 'entreprise')) {
    const c = contacts.find((x) => x.id === i.contact_id)
    const nom = c?.societe?.trim() || [c?.prenom, c?.nom].filter(Boolean).join(' ') || 'Entreprise'
    const e = societes.get(nom) ?? { nom, intervenants: [], lots: new Set<string>(), emails: [] }
    e.intervenants.push(i.id)
    if (i.lot_id) e.lots.add(i.lot_id)
    if (i.diffusion && c?.email) e.emails.push(c.email)
    societes.set(nom, e)
  }
  return [...societes.values()].map((e) => ({
    ...e,
    observations: obs.filter((o) => o.rubrique === 'generale'
      || dossier.obsLots.some((x) => x.observation_id === o.id && e.lots.has(x.lot_id))
      || (o.a_charge_de != null && e.intervenants.includes(o.a_charge_de))
      || dossier.obsIntervenants.some((x) => x.observation_id === o.id && e.intervenants.includes(x.intervenant_id))),
  })).filter((e) => e.observations.some((o) => o.rubrique !== 'generale'))
}
