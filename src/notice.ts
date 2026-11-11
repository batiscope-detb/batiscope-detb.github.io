/**
 * Notice d'accessibilité jointe à une demande d'autorisation de travaux (annexe du Cerfa 13824).
 * Les rubriques suivent les articles de l'arrêté du 8 décembre 2014 (ERP existants) ; un paragraphe
 * est généré par élément relevé, à partir des statuts calculés par le moteur, puis reste modifiable.
 */
import type { LigneElement } from './calculs'
import type { Derogation } from './donnees'
import { libelleMesure, libelleSeuil, type Diagnostic, type Ligne } from './moteur'

export interface Rubrique { code: string; titre: string }

export const RUBRIQUES: Rubrique[] = [
  { code: '1', titre: 'Dispositions générales, information et signalétique' },
  { code: '2', titre: 'Cheminements extérieurs' },
  { code: '3', titre: 'Stationnement automobile' },
  { code: '4', titre: "Accès à l'établissement" },
  { code: '5', titre: 'Accueil du public' },
  { code: '6', titre: 'Circulations intérieures horizontales' },
  { code: '7', titre: 'Circulations intérieures verticales (escaliers, ascenseurs, élévateurs)' },
  { code: '8', titre: 'Tapis roulants, escaliers et plans inclinés mécaniques' },
  { code: '9', titre: 'Revêtements des sols, murs et plafonds' },
  { code: '10', titre: 'Portes, portiques et sas' },
  { code: '11', titre: 'Locaux ouverts au public, équipements et dispositifs de commande' },
  { code: '12', titre: 'Sanitaires' },
  { code: '13', titre: 'Sorties' },
  { code: '14', titre: 'Éclairage' },
  { code: '16', titre: 'Établissements recevant du public assis' },
  { code: '17', titre: "Chambres des établissements comportant des locaux d'hébergement" },
  { code: '18', titre: 'Cabines et espaces à usage individuel' },
  { code: '19', titre: 'Caisses de paiement et équipements disposés en batterie' },
]

/** Rubrique d'une règle à partir de son article (« Art. 7-2 » → 7 ; annexes rattachées à l'article qu'elles précisent). */
export function rubriqueDe(article: string | null | undefined): string {
  const a = (article ?? '').trim()
  const m = a.match(/^Art\.\s*(\d+)/)
  if (m) return m[1] === '15' || m[1] === '20' ? '1' : m[1]
  const ann = a.match(/^Ann\.\s*(\d+)/)
  if (ann) return ann[1] === '4' || ann[1] === '5' ? '2' : ann[1] === '3' ? '1' : '11'
  return '1'
}

export interface ParagrapheGenere { rubrique: string; element_id: string | null; ordre: number; texte_auto: string }

const fr = (n: number) => n.toLocaleString('fr-FR')

function phrase(l: Ligne, derog: Derogation | undefined): string | null {
  const point = l.regle.point.replace(/\.$/, '')
  const seuil = libelleSeuil(l.regle)
  const mesure = l.saisie?.mesure != null ? libelleMesure(l) : null
  switch (l.statut) {
    case 'C': return `${point} : conforme${mesure ? ` (${mesure}${seuil ? ` pour une exigence ${seuil}` : ''})` : ''}.`
    case 'CT': return `${point} : conforme dans la limite de la tolérance admise pour les ERP existants${l.palierRetenu ? ` (${l.palierRetenu.point.replace(/\.$/, '')})` : ''}${mesure ? `, valeur relevée ${mesure}` : ''}.`
    case 'NC': {
      const constat = `${point} : non conforme${mesure ? ` (valeur relevée ${mesure}${seuil ? `, exigence ${seuil}` : ''})` : ''}`
      if (derog) return `${constat} — demande de dérogation (${MOTIFS[derog.motif] ?? derog.motif})${derog.objet ? ` : ${derog.objet.replace(/\.$/, '')}` : ''}.`
      return `${constat} — mise en conformité prévue dans le cadre des travaux.`
    }
    case 'AE': case 'NV': return `${point} : à préciser (vérification complémentaire).`
    default: return null
  }
}

const MOTIFS: Record<string, string> = {
  impossibilite_technique: 'impossibilité technique', patrimoine_architectural: 'préservation du patrimoine architectural',
  disproportion_manifeste: 'disproportion manifeste', refus_copropriete: 'refus des copropriétaires',
}

/** Paragraphes générés à partir du diagnostic (un par élément et par rubrique concernée). */
export function genererNotice(elements: LigneElement[], derogations: Derogation[]): ParagrapheGenere[] {
  const derogPar = new Map(derogations.map((d) => [`${d.element_id}|${d.regle_id}`, d]))
  const res: ParagrapheGenere[] = []
  let ordre = 0
  for (const e of elements) {
    const parRubrique = new Map<string, Ligne[]>()
    for (const l of e.lignes) {
      if (!l.statut || l.statut === 'SO') continue
      const r = rubriqueDe(l.regle.article)
      parRubrique.set(r, [...(parRubrique.get(r) ?? []), l])
    }
    for (const [rubrique, lignes] of parRubrique) {
      const phrases = lignes.map((l) => phrase(l, derogPar.get(`${e.element.id}|${l.regle.id}`))).filter((p): p is string => !!p)
      if (!phrases.length) continue
      const titre = e.element.libelle === e.element.element_type ? e.element.libelle : `${e.element.libelle} (${e.element.element_type.toLowerCase()})`
      const travaux = e.element.travaux_prevus ? ' Élément concerné par les travaux projetés.' : ''
      res.push({ rubrique, element_id: e.element.id, ordre: ordre++, texte_auto: `${titre} :${travaux}\n– ${phrases.join('\n– ')}` })
    }
  }
  return res
}

/** Phrase d'introduction de la notice, tirée du contexte de l'ERP. */
export function introduction(d: Diagnostic, nom: string): string {
  const types = [d.type_erp, ...(d.activites_secondaires ?? [])].filter(Boolean).join(', ')
  const parts = [
    `${nom} est un établissement recevant du public existant${types ? ` de type ${types}` : ''}${d.categorie ? `, classé en ${d.categorie}e catégorie` : ''}.`,
    d.effectif_etages != null ? `L'effectif admis aux étages est de ${fr(d.effectif_etages)} personnes.` : null,
    d.prestations_hors_rdc ? 'Certaines prestations ne sont offertes qu’en étage.' : null,
    d.zone_ert ? `Les parties réservées au personnel${d.zone_ert_description ? ` (${d.zone_ert_description})` : ''} relèvent du Code du travail et ne sont pas traitées dans la présente notice.` : null,
    "La présente notice décrit, rubrique par rubrique, les dispositions prises pour satisfaire aux règles d'accessibilité fixées par l'arrêté du 8 décembre 2014 pour les établissements recevant du public situés dans un cadre bâti existant.",
  ]
  return parts.filter(Boolean).join(' ')
}
