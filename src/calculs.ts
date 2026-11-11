/** Indicateurs calculés à partir des données brutes (tableau de bord et fiches). */
import type { Patrimoine, Projet, StatutErp, Constat, Lot, Verification } from './donnees'
import { echeance } from './verifications'
import { ajouter, lignes, reglesPour, synthese, syntheseVide, taux, type Ligne, type Synthese, type Element, type Diagnostic } from './moteur'

export type StatutAffiche = StatutErp | 'a_diagnostiquer'

export interface LigneElement { element: Element; lignes: Ligne[]; synthese: Synthese }
export interface IndicateursErp {
  projet: Projet
  statut: StatutAffiche
  nbNiveaux: number; nbLocaux: number; nbConstats: number; nbUrgents: number; nbAPrevoir: number
  estimation: number; constatsSansEstimation: number
  diagnostic: Diagnostic | null; elements: LigneElement[]; acc: Synthese; taux: number | null
  derogationsEnCours: number; derogationsAccordees: number
  octets: number; derniereMaj: string
  verifications: Verification[]; verifEnRetard: number; verifProches: number
}

/** Un bâtiment créé mais jamais relevé apparaît « À diagnostiquer ». */
export function statutAffiche(p: Projet, nbConstats: number, nbElements: number): StatutAffiche {
  return p.statut === 'diagnostic' && nbConstats === 0 && nbElements === 0 ? 'a_diagnostiquer' : p.statut
}

function grouper<T>(liste: T[], cle: (t: T) => string | null | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const t of liste) { const k = cle(t); if (k) { const l = m.get(k); if (l) l.push(t); else m.set(k, [t]) } }
  return m
}

export function calculerAccessibilite(diag: Diagnostic, elements: Element[], saisies: Patrimoine['saisies'], fauteuil: Map<string, boolean>): LigneElement[] {
  const parElement = grouper(saisies, (s) => s.element_id)
  return elements
    .slice()
    .sort((a, b) => a.sequence.localeCompare(b.sequence) || a.libelle.localeCompare(b.libelle, 'fr'))
    .map((e) => {
      const ctx = { diagnostic: diag, element: e, niveauAccessibleFauteuil: e.niveau_id ? fauteuil.get(e.niveau_id) ?? null : null }
      const ls = lignes(reglesPour(e.element_type, e.travaux_prevus), parElement.get(e.id) ?? [], ctx).filter((l) => l.applicable)
      return { element: e, lignes: ls, synthese: synthese(ls) }
    })
}

export function indicateurs(p: Patrimoine): IndicateursErp[] {
  const niveaux = grouper(p.niveaux, (n) => n.projet_id)
  const locaux = grouper(p.locaux, (l) => l.projet_id)
  const projetDuLocal = new Map(p.locaux.map((l) => [l.id, l.projet_id]))
  const constats = grouper(p.constats, (c) => projetDuLocal.get(c.local_id))
  const diagParProjet = new Map(p.diagnostics.map((d) => [d.projet_id, d]))
  const elements = grouper(p.elements, (e) => e.diagnostic_id)
  const derog = grouper(p.derogations, (d) => d.diagnostic_id)
  const verifs = grouper(p.verifications ?? [], (v) => v.projet_id)
  const fauteuil = new Map(p.accNiveaux.map((a) => [a.niveau_id, a.accessible_fauteuil]))
  const stock = new Map<string, number>()
  for (const s of p.stockage) stock.set(s.projet_id, (stock.get(s.projet_id) ?? 0) + Number(s.octets))

  return p.projets.map((projet) => {
    const cs = constats.get(projet.id) ?? []
    const diag = diagParProjet.get(projet.id) ?? null
    const els = diag ? calculerAccessibilite(diag, elements.get(diag.id) ?? [], p.saisies, fauteuil) : []
    const acc = els.reduce((s, e) => ajouter(s, e.synthese), syntheseVide())
    const ds = diag ? derog.get(diag.id) ?? [] : []
    const vs = verifs.get(projet.id) ?? []
    const dates = [projet.maj_le, ...cs.map((c) => c.maj_le)].sort()
    return {
      projet,
      statut: statutAffiche(projet, cs.length, els.length),
      nbNiveaux: niveaux.get(projet.id)?.length ?? 0,
      nbLocaux: locaux.get(projet.id)?.length ?? 0,
      nbConstats: cs.length,
      nbUrgents: cs.filter((c) => c.gravite === 'urgent').length,
      nbAPrevoir: cs.filter((c) => c.gravite === 'a_prevoir').length,
      estimation: cs.reduce((s, c) => s + Number(c.estimation ?? 0), 0),
      constatsSansEstimation: cs.filter((c) => c.gravite !== 'info' && c.estimation == null).length,
      diagnostic: diag, elements: els, acc, taux: taux(acc),
      derogationsEnCours: ds.filter((d) => ['envisagee', 'redigee', 'deposee', 'avis_rendu'].includes(d.statut)).length,
      derogationsAccordees: ds.filter((d) => d.statut === 'accordee').length,
      octets: stock.get(projet.id) ?? 0,
      derniereMaj: dates[dates.length - 1],
      verifications: vs,
      verifEnRetard: vs.filter((v) => echeance(v).etat === 'retard').length,
      verifProches: vs.filter((v) => echeance(v).etat === 'proche').length,
    }
  })
}

/** Estimations par corps d'état (lot), tous bâtiments ou un seul. */
export function travauxParLot(constats: Constat[], lots: Lot[]): { lot: string; montant: number; nb: number; urgents: number }[] {
  const nom = new Map(lots.map((l) => [l.id, l.libelle]))
  const m = new Map<string, { lot: string; montant: number; nb: number; urgents: number }>()
  for (const c of constats) {
    if (c.gravite === 'info') continue
    const k = c.lot_id ? nom.get(c.lot_id) ?? 'Lot supprimé' : 'Sans lot'
    const v = m.get(k) ?? { lot: k, montant: 0, nb: 0, urgents: 0 }
    v.montant += Number(c.estimation ?? 0); v.nb++; if (c.gravite === 'urgent') v.urgents++
    m.set(k, v)
  }
  return [...m.values()].sort((a, b) => b.montant - a.montant || b.nb - a.nb)
}

export interface Alerte { projetId: string; nom: string; texte: string; niveau: 'rouge' | 'ambre' | 'gris' }
export function alertes(ind: IndicateursErp[]): Alerte[] {
  const res: Alerte[] = []
  for (const i of ind) {
    const nom = i.projet.nom, projetId = i.projet.id
    if (i.nbUrgents) res.push({ projetId, nom, niveau: 'rouge', texte: `${i.nbUrgents} constat${i.nbUrgents > 1 ? 's' : ''} urgent${i.nbUrgents > 1 ? 's' : ''}` })
    if (i.acc.bloquantes) res.push({ projetId, nom, niveau: 'rouge', texte: `${i.acc.bloquantes} non-conformité${i.acc.bloquantes > 1 ? 's' : ''} bloquante${i.acc.bloquantes > 1 ? 's' : ''} (accessibilité)` })
    if (i.constatsSansEstimation) res.push({ projetId, nom, niveau: 'ambre', texte: `${i.constatsSansEstimation} constat${i.constatsSansEstimation > 1 ? 's' : ''} sans estimation` })
    if (i.derogationsEnCours) res.push({ projetId, nom, niveau: 'ambre', texte: `${i.derogationsEnCours} dérogation${i.derogationsEnCours > 1 ? 's' : ''} en cours d'instruction` })
    if (i.verifEnRetard) res.push({ projetId, nom, niveau: 'rouge', texte: `${i.verifEnRetard} vérification${i.verifEnRetard > 1 ? 's' : ''} périodique${i.verifEnRetard > 1 ? 's' : ''} en retard` })
    if (i.verifProches) res.push({ projetId, nom, niveau: 'ambre', texte: `${i.verifProches} vérification${i.verifProches > 1 ? 's' : ''} à prévoir sous 60 jours` })
    if (i.acc.aExpertiser) res.push({ projetId, nom, niveau: 'gris', texte: `${i.acc.aExpertiser} point${i.acc.aExpertiser > 1 ? 's' : ''} à expertiser` })
  }
  const ordre = { rouge: 0, ambre: 1, gris: 2 }
  return res.sort((a, b) => ordre[a.niveau] - ordre[b.niveau])
}
