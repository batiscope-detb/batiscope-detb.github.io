/**
 * Tableau réglementaire de la notice d'accessibilité, sur le modèle utilisé par la DETB :
 * pour chaque article de l'arrêté du 8 décembre 2014, les dispositions réglementaires (colonne de gauche)
 * et les dispositions prévues (colonne de droite), remplie automatiquement depuis le diagnostic puis modifiable.
 */
import brut from './data/notice_tableau.json'
import type { LigneElement } from './calculs'
import type { Derogation } from './donnees'
import { libelleMesure, type Statut } from './moteur'

export interface LigneModele { id?: string; l?: string; s?: string; r?: string[] }
export interface ArticleModele { article: number; titre: string; lignes: LigneModele[] }
export const ARTICLES = brut as ArticleModele[]

const MOTIFS: Record<string, string> = {
  impossibilite_technique: 'impossibilité technique', patrimoine_architectural: 'préservation du patrimoine architectural',
  disproportion_manifeste: 'disproportion manifeste', refus_copropriete: 'refus des copropriétaires',
}

const nomElement = (e: LigneElement) => e.element.libelle

/** Texte proposé pour une ligne du tableau. Chaîne vide = à compléter par l'agent. */
export function texteAuto(regles: string[] | undefined, elements: LigneElement[], derogations: Derogation[]): string {
  if (!regles?.length) return ''
  const ids = new Set(regles)
  const vus: { e: LigneElement; statut: Statut | null; mesure: string | null; commentaire: string | null; regle: string }[] = []
  for (const e of elements) for (const l of e.lignes) {
    if (!ids.has(l.regle.id)) continue
    vus.push({ e, statut: l.statut, mesure: l.saisie?.mesure != null ? libelleMesure(l) : null, commentaire: l.saisie?.commentaire ?? null, regle: l.regle.id })
  }
  // Signalétique générale non relevée : à compléter plutôt que « sans objet ».
  if (!vus.length) return regles.every((r) => r.startsWith('SIG-')) && !elements.some((e) => e.element.element_type === 'Signalétique') ? '' : 'Sans objet'
  const derog = new Map(derogations.map((d) => [`${d.element_id}|${d.regle_id}`, d]))
  const noms = (liste: typeof vus) => [...new Set(liste.map((v) => nomElement(v.e)))].join(', ')
  const nc = vus.filter((v) => v.statut === 'NC')
  const aVerifier = vus.filter((v) => v.statut === 'AE' || v.statut === 'NV')
  const vides = vus.filter((v) => v.statut == null)
  const ok = vus.filter((v) => v.statut === 'C' || v.statut === 'CT')
  const parts: string[] = []
  if (nc.length) {
    const avecDerog = nc.filter((v) => derog.has(`${v.e.element.id}|${v.regle}`))
    const sansDerog = nc.filter((v) => !derog.has(`${v.e.element.id}|${v.regle}`))
    if (sansDerog.length) {
      const mesures = sansDerog.filter((v) => v.mesure).map((v) => `${v.mesure} relevé${sansDerog.length > 1 ? ` (${nomElement(v.e)})` : ''}`)
      parts.push(`Non conforme${sansDerog.length > 1 || ok.length ? ` (${noms(sansDerog)})` : ''}${mesures.length ? ` — ${mesures.join(', ')}` : ''} : mise en conformité prévue dans le cadre des travaux.`)
    }
    for (const v of avecDerog) {
      const d = derog.get(`${v.e.element.id}|${v.regle}`)!
      parts.push(`Demande de dérogation (${MOTIFS[d.motif] ?? d.motif})${nc.length > 1 ? ` — ${nomElement(v.e)}` : ''}${d.objet ? ` : ${d.objet.replace(/\.$/, '')}` : ''}.${d.mesures_substitution ? ` Mesures de substitution : ${d.mesures_substitution.replace(/\.$/, '')}.` : ''}`)
    }
  }
  if (ok.length) {
    const tol = ok.some((v) => v.statut === 'CT')
    const mesures = ok.filter((v) => v.mesure).slice(0, 3).map((v) => `${v.mesure}${ok.length > 1 ? ` (${nomElement(v.e)})` : ''}`)
    parts.push(`${nc.length || aVerifier.length || vides.length ? `Existant conforme (${noms(ok)})` : 'Existant conforme'}${tol ? ' dans la limite des tolérances admises en ERP existant' : ''}${mesures.length ? ` — relevé : ${mesures.join(', ')}` : ''}.`)
  }
  if (aVerifier.length) parts.push(`À vérifier (${noms(aVerifier)}).`)
  if (!parts.length && vides.length === 0) return 'Sans objet'
  return parts.join('\n')
}

export interface LigneCalculee { id: string; texte: string; auto: string; modifie: boolean }

/** Lignes du tableau avec le texte retenu (retouche enregistrée sinon texte automatique). */
export function calculerTableau(elements: LigneElement[], derogations: Derogation[], retouches: Map<string, string | null>) {
  return ARTICLES.map((a) => {
    const autos = new Map(a.lignes.filter((x) => x.id).map((x) => [x.id!, texteAuto(x.r, elements, derogations)]))
    // Lignes sans règle correspondante : sans objet si rien n'a été relevé pour cet article, sinon à compléter.
    const concerne = a.lignes.some((x) => x.r?.length && autos.get(x.id!) !== 'Sans objet')
    return {
    ...a,
    lignes: a.lignes.map((x) => {
      if (!x.id) return { ...x, calc: null as LigneCalculee | null }
      const auto = x.r?.length ? autos.get(x.id)! : concerne ? '' : 'Sans objet'
      const r = retouches.get(x.id)
      return { ...x, calc: { id: x.id, auto, texte: r ?? auto, modifie: r != null } }
    }),
    }
  })
}

/** Article entièrement sans objet (aucun élément relevé ne s'y rapporte). */
export const articleSansObjet = (lignes: { calc: LigneCalculee | null }[]) => lignes.every((x) => !x.calc || x.calc.texte === 'Sans objet')
