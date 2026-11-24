/**
 * Module Réception : données des formulaires EXE de la DAJ et leur traduction en règles de remplissage.
 * CCAG Travaux 2021 (art. 41 à 44) pour EXE4 à EXE9, CCAG FCS 2021 pour EXE3 (admission des fournitures courantes).
 */
import { joursFeries } from '../planning/moteur'
import type { Annexe, Spec } from './remplir'

export type CodeExe = 'EXE3' | 'EXE4' | 'EXE5' | 'EXE6' | 'EXE7' | 'EXE8' | 'EXE9'
export const CODES: CodeExe[] = ['EXE3', 'EXE4', 'EXE5', 'EXE6', 'EXE7', 'EXE8', 'EXE9']
export const TITRES: Record<CodeExe, string> = {
  EXE3: 'Admission des fournitures courantes', EXE4: 'PV des opérations préalables à la réception', EXE5: 'Propositions du maître d’œuvre',
  EXE6: 'Décision de réception', EXE7: 'Décision de non-réception', EXE8: 'PV de levée des réserves', EXE9: 'Propositions et décision de levée des réserves',
}

// --- Réserves ---------------------------------------------------------------------------------------------
export type Categorie = 'epreuve' | 'travaux' | 'malfacon' | 'pose' | 'installations' | 'lieux'
export const CATEGORIES: { code: Categorie; libelle: string; court: string }[] = [
  { code: 'malfacon', libelle: 'Imperfections et malfaçons', court: 'Malfaçon' },
  { code: 'travaux', libelle: 'Travaux et prestations non exécutés', court: 'Travaux non exécutés' },
  { code: 'epreuve', libelle: 'Épreuves non effectuées ou non concluantes', court: 'Épreuve' },
  { code: 'pose', libelle: 'Conditions de pose des équipements non conformes', court: 'Pose' },
  { code: 'installations', libelle: 'Installations de chantier non repliées', court: 'Installations' },
  { code: 'lieux', libelle: 'Terrains et lieux non remis en état', court: 'Remise en état' },
]
export interface Reserve { id: string; numero: string; texte: string; categorie_reserve: string | null; echeance: string | null; soldee_le: string | null; localisation?: string }
const de = (rs: Reserve[], c: Categorie) => rs.filter((r) => (r.categorie_reserve ?? 'malfacon') === c)
const levee = (r: Reserve) => !!r.soldee_le

// --- Données saisies --------------------------------------------------------------------------------------
export type Donnees = Record<string, string | boolean | undefined>
export type OuiNon = 'oui' | 'non'

export interface Identite {
  titulaire: { raison: string; adresse1: string; adresse2: string; tel: string; mail: string; siret: string }
  direction: { nom: string; pole: string; adresse: string; codePostal: string }
  agent: { nom: string; tel: string; mail: string }
  moe: string
  objet: string; lieu: string; lot: string; lotCode: string; marche: string
  prestations: string; partielle: boolean
}

/** Date ISO → « 12/03/2027 ». */
export const fr = (iso?: string | boolean | null) => (typeof iso === 'string' && iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

// --- Délais (jours calendaires ; fin un samedi, dimanche ou jour férié : premier jour ouvrable suivant) ----
const iso = (d: Date) => d.toISOString().slice(0, 10)
export function ajouterJours(depart: string, jours: number, prolonger = true): string {
  const d = new Date(`${depart.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + jours)
  if (prolonger) while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || joursFeries(d.getUTCFullYear()).has(iso(d))) d.setUTCDate(d.getUTCDate() + 1)
  return iso(d)
}
export function ajouterMois(depart: string, mois: number): string {
  const d = new Date(`${depart.slice(0, 10)}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + mois)
  return iso(d)
}

export interface Echeance { cle: string; libelle: string; date: string | null; faite: boolean; aide: string }
/** Échéances de la procédure de réception (CCAG Travaux 2021, art. 41 et 44). */
export function echeances(d: Donnees, reserves: Reserve[]): Echeance[] {
  const s = (k: string) => (typeof d[k] === 'string' && d[k] ? (d[k] as string) : null)
  const avis = s('achevement_propose'), opr = s('opr_le'), decision = s('decision_le'), achevement = s('d_achevement') ?? s('p_achevement')
  const oprLimite = avis ? ajouterJours(avis, 20) : null
  const gpa = decision && achevement ? ajouterMois(achevement, 12) : null
  const leveeLimite = s('d_malfacons_avant') ?? (gpa ? ajouterMois(gpa, -3) : null)
  const restantes = reserves.filter((r) => !levee(r)).length
  return [
    { cle: 'opr', libelle: 'Opérations préalables (EXE4)', date: opr ?? oprLimite, faite: !!opr, aide: opr ? 'OPR réalisées' : 'Au plus tard 20 jours après l’avis d’achèvement du titulaire (art. 41.1)' },
    { cle: 'exe5', libelle: 'Propositions du maître d’œuvre (EXE5)', date: s('propositions_le') ?? (opr ? ajouterJours(opr, 5) : null), faite: !!s('propositions_le'), aide: 'Dans les 5 jours suivant le PV des OPR (art. 41.2)' },
    { cle: 'exe6', libelle: 'Décision du maître d’ouvrage (EXE6 / EXE7)', date: decision ?? (opr ? ajouterJours(opr, 30) : null), faite: !!decision, aide: 'Notifiée dans les 30 jours suivant le PV ; à défaut, les propositions du maître d’œuvre s’imposent (art. 41.3)' },
    { cle: 'levee', libelle: `Levée des réserves${restantes ? ` (${restantes} restante${restantes > 1 ? 's' : ''})` : ''}`, date: s('levee_le') ?? leveeLimite, faite: !!s('levee_le') && restantes === 0, aide: 'Délai fixé par la décision, sinon 3 mois avant la fin du délai de garantie (art. 41.6)' },
    { cle: 'gpa', libelle: 'Fin de la garantie de parfait achèvement', date: gpa, faite: false, aide: 'Un an à compter de la date d’effet de la réception (art. 44.1)' },
  ]
}

// --- Champs de saisie par étape ---------------------------------------------------------------------------
export type TypeChamp = 'date' | 'ouinon' | 'choix' | 'texte' | 'case' | 'long'
export interface Champ {
  cle: string; libelle: string; type: TypeChamp; options?: [string, string][]
  /** Valeur proposée quand rien n'est saisi (souvent déduite des réserves). */
  defaut?: (d: Donnees, rs: Reserve[]) => string | boolean | undefined
  visible?: (d: Donnees) => boolean
}
export interface Etape { code: CodeExe | 'EXE6/7'; titre: string; champs: Champ[]; genre: 'travaux' | 'fcs' }

const EXCEPTION: [string, string][] = [['oui', 'Oui'], ['sauf', 'Oui, sauf réserves (annexe)']]
const constats = (p: '' | 'l_', rsDe: (rs: Reserve[]) => Reserve[]): Champ[] => [
  { cle: `${p}presence_moa`, libelle: 'Représentant du maître d’ouvrage présent', type: 'ouinon', defaut: () => 'oui' },
  { cle: `${p}presence_titulaire`, libelle: 'Titulaire présent', type: 'ouinon', defaut: () => 'oui' },
  { cle: `${p}convocation_le`, libelle: 'Titulaire convoqué par courrier du', type: 'date', visible: (d) => vo(d, `${p}presence_titulaire`) === 'non' },
  { cle: `${p}epreuves`, libelle: '1. Épreuves prévues au marché', type: 'choix', options: [['sans', 'Sans objet (aucune épreuve prévue)'], ['non', 'Non effectuées'], ['faites', 'Effectuées'], ['faites_sauf', 'Effectuées, sauf annexe']], defaut: () => 'sans' },
  { cle: `${p}concluantes`, libelle: 'Épreuves concluantes', type: 'choix', options: EXCEPTION, visible: (d) => String(vo(d, `${p}epreuves`)).startsWith('faites'),
    defaut: (_d, rs) => (de(rsDe(rs), 'epreuve').length ? 'sauf' : 'oui') },
  { cle: `${p}travaux`, libelle: p ? '2. Travaux ayant fait l’objet de réserves exécutés' : '2. Travaux et prestations exécutés', type: 'choix', options: EXCEPTION, defaut: (_d, rs) => (de(rsDe(rs), 'travaux').length ? 'sauf' : 'oui') },
  { cle: `${p}ouvrages`, libelle: '3. Ouvrages conformes au marché', type: 'choix', options: EXCEPTION, defaut: (_d, rs) => (de(rsDe(rs), 'malfacon').length ? 'sauf' : 'oui') },
  { cle: `${p}pose`, libelle: '4. Conditions de pose conformes aux spécifications des fournisseurs', type: 'ouinon', defaut: (_d, rs) => (de(rsDe(rs), 'pose').length ? 'non' : 'oui') },
  { cle: `${p}installations`, libelle: '5. Installations de chantier repliées', type: 'ouinon', defaut: (_d, rs) => (de(rsDe(rs), 'installations').length ? 'non' : 'oui') },
  { cle: `${p}lieux`, libelle: '6. Terrains et lieux remis en état', type: 'ouinon', defaut: (_d, rs) => (de(rsDe(rs), 'lieux').length ? 'non' : 'oui') },
  { cle: `${p}accepte_le`, libelle: 'PV accepté (signé) par le titulaire le', type: 'date', visible: (d) => !vo(d, `${p}refus_signature`) },
  { cle: `${p}refus_signature`, libelle: 'Le titulaire a refusé de signer le PV', type: 'case' },
]
const toutes = (rs: Reserve[]) => rs
const nonLevees = (rs: Reserve[]) => rs.filter((r) => !levee(r))
const modeDefaut = (rs: Reserve[]) => (rs.length === 0 ? 'sans' : de(rs, 'malfacon').length || de(rs, 'pose').length || de(rs, 'installations').length || de(rs, 'lieux').length ? 'avec' : 'sous')
const propositions = (p: 'p_' | 'd_', titre: string): Champ[] => [
  { cle: `${p}reception`, libelle: titre, type: 'choix', options: [['oui', 'Prononcer la réception'], ['non', 'Ne pas prononcer la réception']], defaut: (d) => (p === 'd_' ? (vo(d, 'p_reception') as string) ?? 'oui' : 'oui') },
  { cle: `${p}achevement`, libelle: 'Date retenue pour l’achèvement des travaux', type: 'date', visible: (d) => vo(d, `${p}reception`) !== 'non',
    defaut: (d) => (p === 'd_' ? (vo(d, 'p_achevement') as string) : (d.achevement_propose as string)) },
  { cle: `${p}mode`, libelle: 'Réception', type: 'choix', options: [['sans', 'Sans réserve'], ['sous', 'Sous réserve (épreuves / travaux à exécuter)'], ['avec', 'Avec réserves (malfaçons, pose, repli, remise en état)']],
    visible: (d) => vo(d, `${p}reception`) !== 'non', defaut: (d, rs) => (p === 'd_' ? (vo(d, 'p_mode') as string) : modeDefaut(rs)) },
  { cle: `${p}sous_epreuves`, libelle: 'Sous réserve de l’exécution concluante des épreuves (annexe)', type: 'case', visible: (d) => vo(d, `${p}mode`) === 'sous', defaut: (d, rs) => (p === 'd_' ? vo(d, 'p_sous_epreuves') : de(rs, 'epreuve').length > 0) },
  { cle: `${p}sous_travaux`, libelle: 'Sous réserve de l’exécution des travaux et prestations (annexe)', type: 'case', visible: (d) => vo(d, `${p}mode`) === 'sous', defaut: (d, rs) => (p === 'd_' ? vo(d, 'p_sous_travaux') : de(rs, 'travaux').length > 0) },
  ...(p === 'd_' ? [{ cle: 'd_sous_travaux_avant', libelle: '… avant le', type: 'date' as TypeChamp, visible: (d: Donnees) => vo(d, 'd_mode') === 'sous' && !!vo(d, 'd_sous_travaux') }] : []),
  { cle: `${p}malfacons`, libelle: 'Le titulaire doit remédier aux imperfections et malfaçons (annexe)', type: 'case', visible: (d) => vo(d, `${p}mode`) === 'avec', defaut: (d, rs) => (p === 'd_' ? vo(d, 'p_malfacons') : de(rs, 'malfacon').length > 0) },
  { cle: `${p}malfacons_avant`, libelle: '… avant le', type: 'date', visible: (d) => vo(d, `${p}mode`) === 'avec' && !!vo(d, `${p}malfacons`), defaut: (d) => (p === 'd_' ? (vo(d, 'p_malfacons_avant') as string) : undefined) },
  { cle: `${p}refaction`, libelle: 'Réfaction proposée à la place de la reprise (montant HT en prix de base)', type: 'texte', visible: (d) => vo(d, `${p}mode`) === 'avec' && !!vo(d, `${p}malfacons`), defaut: (d) => (p === 'd_' ? (vo(d, 'p_refaction') as string) : undefined) },
  { cle: `${p}lieux`, libelle: 'Repli des installations et remise en état des lieux', type: 'case', visible: (d) => vo(d, `${p}mode`) === 'avec', defaut: (d, rs) => (p === 'd_' ? vo(d, 'p_lieux') : de(rs, 'installations').length + de(rs, 'lieux').length > 0) },
  { cle: `${p}lieux_avant`, libelle: '… avant le', type: 'date', visible: (d) => vo(d, `${p}mode`) === 'avec' && !!vo(d, `${p}lieux`), defaut: (d) => (p === 'd_' ? (vo(d, 'p_lieux_avant') as string) : undefined) },
  { cle: `${p}pose`, libelle: 'Mise en conformité des conditions de pose des équipements', type: 'case', visible: (d) => vo(d, `${p}mode`) === 'avec', defaut: (d, rs) => (p === 'd_' ? vo(d, 'p_pose') : de(rs, 'pose').length > 0) },
  { cle: `${p}pose_avant`, libelle: '… avant le', type: 'date', visible: (d) => vo(d, `${p}mode`) === 'avec' && !!vo(d, `${p}pose`), defaut: (d) => (p === 'd_' ? (vo(d, 'p_pose_avant') as string) : undefined) },
]
const CHOIX_LEVEE: [string, string][] = [['lever_tout', 'Lever toutes les réserves'], ['lever_partie', 'Lever une partie des réserves (annexe), maintenir les autres'], ['maintenir', 'Maintenir l’ensemble des réserves'], ['rapporter', 'Rapporter la réception (épreuves non concluantes)']]
const maintiens = (p: 'lp_' | 'ld_'): Champ[] => {
  const vis = (d: Donnees) => vo(d, `${p}choix`) === 'lever_partie'
  const restant = (c: Categorie[]) => (_d: Donnees, rs: Reserve[]) => nonLevees(rs).some((r) => c.includes((r.categorie_reserve ?? 'malfacon') as Categorie))
  return [
    { cle: `${p}m_epreuves`, libelle: 'Maintenir : épreuves (annexe)', type: 'case', visible: vis, defaut: restant(['epreuve']) },
    { cle: `${p}m_travaux`, libelle: 'Maintenir : travaux et prestations (annexe)', type: 'case', visible: vis, defaut: restant(['travaux']) },
    { cle: `${p}m_malfacons`, libelle: 'Maintenir : imperfections et malfaçons (annexe)', type: 'case', visible: vis, defaut: restant(['malfacon']) },
    { cle: `${p}m_lieux`, libelle: 'Maintenir : repli et remise en état des lieux', type: 'case', visible: vis, defaut: restant(['installations', 'lieux']) },
    { cle: `${p}m_lieux_avant`, libelle: '… avant le', type: 'date', visible: (d) => vis(d) && !!vo(d, `${p}m_lieux`) },
    { cle: `${p}m_pose`, libelle: 'Maintenir : conditions de pose', type: 'case', visible: vis, defaut: restant(['pose']) },
    { cle: `${p}m_pose_avant`, libelle: '… avant le', type: 'date', visible: (d) => vis(d) && !!vo(d, `${p}m_pose`) },
  ]
}

export const ETAPES: Etape[] = [
  { code: 'EXE4', titre: 'Opérations préalables à la réception', genre: 'travaux', champs: [
    { cle: 'achevement_propose', libelle: 'Date d’achèvement proposée par le titulaire', type: 'date' },
    { cle: 'opr_le', libelle: 'Date des OPR (PV dressé le)', type: 'date' },
    ...constats('', toutes),
  ] },
  { code: 'EXE5', titre: 'Propositions du maître d’œuvre', genre: 'travaux', champs: [
    { cle: 'propositions_le', libelle: 'Propositions datées du', type: 'date', defaut: (d) => d.opr_le as string },
    ...propositions('p_', 'Le maître d’œuvre propose'),
  ] },
  { code: 'EXE6/7', titre: 'Décision du maître d’ouvrage', genre: 'travaux', champs: [
    { cle: 'decision_le', libelle: 'Décision datée du', type: 'date' },
    { cle: 'lettre_refaction_le', libelle: 'Lettre du titulaire acceptant la réfaction, du', type: 'date', visible: (d) => !!vo(d, 'd_refaction') || !!vo(d, 'p_refaction') },
    ...propositions('d_', 'Le maître d’ouvrage décide'),
  ] },
  { code: 'EXE8', titre: 'Levée des réserves', genre: 'travaux', champs: [
    { cle: 'levee_le', libelle: 'PV de levée des réserves dressé le', type: 'date' },
    ...constats('l_', nonLevees),
  ] },
  { code: 'EXE9', titre: 'Propositions et décision de levée', genre: 'travaux', champs: [
    { cle: 'lp_le', libelle: 'Propositions du maître d’œuvre datées du', type: 'date', defaut: (d) => d.levee_le as string },
    { cle: 'lp_choix', libelle: 'Le maître d’œuvre propose de', type: 'choix', options: CHOIX_LEVEE, defaut: (_d, rs) => (rs.length && nonLevees(rs).length === 0 ? 'lever_tout' : nonLevees(rs).length === rs.length ? 'maintenir' : 'lever_partie') },
    ...maintiens('lp_'),
    { cle: 'ld_le', libelle: 'Décision du maître d’ouvrage datée du', type: 'date' },
    { cle: 'ld_choix', libelle: 'Le maître d’ouvrage décide', type: 'choix', options: [['accepter', 'D’accepter les propositions du maître d’œuvre'], ...CHOIX_LEVEE.map(([k, v]) => [k, `De ne pas les retenir et de : ${v.toLowerCase()}`] as [string, string])], defaut: () => 'accepter' },
    ...maintiens('ld_'),
  ] },
  { code: 'EXE3', titre: 'Admission des fournitures', genre: 'fcs', champs: [
    { cle: 'bc_numero', libelle: 'Bon de commande n° (marché à bons de commande)', type: 'texte' },
    { cle: 'bc_date', libelle: 'Bon de commande du', type: 'date', visible: (d) => !!vo(d, 'bc_numero') },
    { cle: 'nature', libelle: 'Nature des prestations objet de la décision', type: 'texte' },
    { cle: 'livraison_prevue', libelle: 'Date de livraison prévue', type: 'date' },
    { cle: 'verification_le', libelle: 'Opérations de vérification le', type: 'date' },
    { cle: 'f_presence', libelle: 'Titulaire présent (ou représenté)', type: 'ouinon', defaut: () => 'oui' },
    { cle: 'f_accepter', libelle: 'Vérification quantitative : prestations acceptées en l’état', type: 'texte' },
    { cle: 'f_reprendre', libelle: 'Mise en demeure de reprendre l’excédent fourni (prestation)', type: 'texte' },
    { cle: 'f_completer', libelle: 'Mise en demeure de compléter la livraison / achever (prestation)', type: 'texte' },
    { cle: 'f_qualite', libelle: 'Vérification qualitative : décision', type: 'choix', options: [['admission', 'Prononcer l’admission'], ['ajournement', 'Ajourner l’admission'], ['refaction', 'Admettre avec réfaction'], ['rejet', 'Rejeter']], defaut: () => 'admission' },
    { cle: 'f_prestations', libelle: 'Prestations concernées', type: 'long' },
    { cle: 'f_motifs', libelle: 'Motifs de la décision', type: 'long', visible: (d) => vo(d, 'f_qualite') !== 'admission' },
    { cle: 'f_mises_au_point', libelle: 'Mises au point à effectuer par le titulaire', type: 'texte', visible: (d) => vo(d, 'f_qualite') === 'ajournement' },
    { cle: 'f_delai_presenter', libelle: 'Délai pour présenter les prestations mises au point', type: 'texte', visible: (d) => vo(d, 'f_qualite') === 'ajournement' },
    { cle: 'f_delai_acceptation', libelle: 'Délai pour faire connaître son acceptation de l’ajournement', type: 'texte', visible: (d) => vo(d, 'f_qualite') === 'ajournement' },
    { cle: 'f_delai_verif', libelle: 'Délai de vérification après nouvelle présentation', type: 'texte', visible: (d) => vo(d, 'f_qualite') === 'ajournement' },
    { cle: 'f_delai_enlever', libelle: 'Délai pour enlever les prestations ajournées', type: 'texte', visible: (d) => vo(d, 'f_qualite') === 'ajournement' },
    { cle: 'f_montant_refaction', libelle: 'Montant de la réfaction proposée', type: 'texte', visible: (d) => vo(d, 'f_qualite') === 'refaction' },
    { cle: 'f_delai_observations', libelle: 'Délai pour présenter ses observations', type: 'texte', visible: (d) => ['refaction', 'rejet'].includes(String(vo(d, 'f_qualite'))) },
    { cle: 'f_delai_reexecuter', libelle: 'Délai pour exécuter à nouveau les prestations', type: 'texte', visible: (d) => vo(d, 'f_qualite') === 'rejet' },
    { cle: 'f_delai_enlever_rejet', libelle: 'Délai pour enlever les prestations rejetées', type: 'texte', visible: (d) => vo(d, 'f_qualite') === 'rejet' },
    { cle: 'f_signature_le', libelle: 'Décision signée le', type: 'date' },
  ] },
]

// Valeurs effectives : saisie, sinon valeur proposée. Le jeu de réserves courant sert aux propositions.
let reservesCourantes: Reserve[] = []
const tousChamps = ETAPES.flatMap((e) => e.champs)
const parCle = new Map(tousChamps.map((c) => [c.cle, c]))
function vo(d: Donnees, cle: string): string | boolean | undefined {
  if (d[cle] !== undefined && d[cle] !== '') return d[cle]
  return parCle.get(cle)?.defaut?.(d, reservesCourantes)
}
/** Valeur effective d'un champ (saisie ou proposition). */
export function valeur(d: Donnees, rs: Reserve[], cle: string) { reservesCourantes = rs; return vo(d, cle) }
export function estVisible(c: Champ, d: Donnees, rs: Reserve[]) { reservesCourantes = rs; return !c.visible || c.visible(d) }

// --- Annexes ---------------------------------------------------------------------------------------------
/** Annexes numérotées : une par catégorie de réserves présente (malfaçons, travaux, épreuves, autres). */
export function annexes(rs: Reserve[], titreSuffixe = ''): { liste: Annexe[]; numero: Partial<Record<Categorie | 'levees', string>> } {
  const liste: Annexe[] = []
  const numero: Partial<Record<Categorie | 'levees', string>> = {}
  const ligne = (r: Reserve) => [r.numero, r.texte + (r.localisation ? `\n(${r.localisation})` : ''), fr(r.echeance), r.soldee_le ? `Levée le ${fr(r.soldee_le)}` : '']
  const groupes: { cats: Categorie[]; titre: string }[] = [
    { cats: ['epreuve'], titre: 'Épreuves' }, { cats: ['travaux'], titre: 'Travaux et prestations non exécutés' },
    { cats: ['malfacon'], titre: 'Imperfections et malfaçons' }, { cats: ['pose', 'installations', 'lieux'], titre: 'Conditions de pose, repli des installations, remise en état' },
  ]
  for (const g of groupes) {
    const lignes = rs.filter((r) => g.cats.includes((r.categorie_reserve ?? 'malfacon') as Categorie))
    if (!lignes.length) continue
    const n = String(liste.length + 1)
    for (const c of g.cats) numero[c] = n
    liste.push({ titre: `Annexe n° ${n} — ${g.titre}${titreSuffixe}`, entetes: ['N°', 'Désignation', 'À lever avant le', 'Suivi'], largeurs: [1, 7, 2, 2], lignes: lignes.map(ligne) })
  }
  return { liste, numero }
}

// --- Règles de remplissage --------------------------------------------------------------------------------
const champsCommuns = (id: Identite): Record<string, string> => ({
  'Raison sociale entreprise': id.titulaire.raison, 'adresse entreprise 1': id.titulaire.adresse1, 'adresse entreprise 2': id.titulaire.adresse2,
  'Tél entreprise': id.titulaire.tel, 'Mail entreprise': id.titulaire.mail, 'Siret entreprise': id.titulaire.siret,
  'Direction en charge du dossier': id.direction.nom, 'Adresse direction en charge du dossier': id.direction.adresse, 'code postal direction': id.direction.codePostal,
  'Prénom NOM agent': id.agent.nom, 'tél agent': id.agent.tel, 'mail agent': id.agent.mail,
  'Objet du marché': id.objet, 'Code postal et commune de l’opération': id.lieu, "Code postal et commune de l'opération": id.lieu,
  'n° de lot et intitulé du lot': id.lot, 'n° de lot': id.lotCode, 'référence du marché public': id.marche, 'N° du marché': id.marche ? `Marché n° ${id.marche}` : '',
  'Prénom, NOM du maitre d’œuvre': id.moe, "Prénom, NOM du maitre d'œuvre": id.moe, 'Prénom, NOM du maître d’œuvre': id.moe,
  'zone de texte à remplir par le technicien': id.prestations,
})
const remplacementsCommuns = (id: Identite): [string, string][] => (id.direction.pole && id.direction.pole !== 'Pôle Patrimoine et Cadre de Vie' ? [['Pôle Patrimoine et Cadre de Vie', id.direction.pole]] : [])
const c = (ancre: string, coche: unknown, rang?: number) => ({ ancre, coche: !!coche, rang })
const s = (v: unknown) => (typeof v === 'string' ? v : '')

/** Cases « objet » (réception totale ou partielle) avec les prestations à la ligne. */
const objet = (id: Identite) => ({
  cases: [c('la réception de l’ouvrage comportant les prestations suivantes', !id.partielle), c('la réception partielle de l’ouvrage relative aux prestations', id.partielle)],
  ajouts: [{ ancre: id.partielle ? 'la réception partielle de l’ouvrage relative aux prestations' : 'la réception de l’ouvrage comportant les prestations suivantes', texte: id.prestations }],
})

function specConstats(d: Donnees, rs: Reserve[], p: '' | 'l_', n: Partial<Record<string, string>>): Spec {
  const v = (k: string) => valeur(d, rs, p + k)
  const ep = v('epreuves'), cc = v('concluantes')
  const cases = [
    c('en présence du représentant du pouvoir adjudicateur', v('presence_moa') !== 'non'),
    c('en l’absence du représentant du pouvoir adjudicateur', v('presence_moa') === 'non'),
    c('en présence du titulaire du marché public', v('presence_titulaire') !== 'non'),
    c('en l’absence du titulaire du marché public dûment convoqué', v('presence_titulaire') === 'non'),
    c('n’ont pas été effectuées', ep === 'non'),
    c('ont été effectuées, à l’exception de celles indiquées', ep === 'faites_sauf'),
    c('et sont concluantes ;', String(ep).startsWith('faites') && cc !== 'sauf'),
    c('et sont concluantes, à l’exception', String(ep).startsWith('faites') && cc === 'sauf'),
    c('ont été exécutés ;', v('travaux') !== 'sauf'),
    c('ont été exécutés, à l’exception', v('travaux') === 'sauf'),
    c(p ? 'sont conformes aux spécifications du marché public, les imperfections' : 'sont conformes aux spécifications du marché public ;', v('ouvrages') !== 'sauf'),
    c('sont conformes aux spécifications du marché public, à l’exception', v('ouvrages') === 'sauf'),
    c('sont conformes aux spécifications des fournisseurs', v('pose') !== 'non'),
    c('ne sont pas conformes aux spécifications des fournisseurs', v('pose') === 'non'),
    c('ont été repliées', v('installations') !== 'non'),
    c('n’ont pas été repliées', v('installations') === 'non'),
    c('ont été remis en état', v('lieux') !== 'non'),
    c('n’ont pas été remis en état', v('lieux') === 'non'),
    c('J’atteste que le titulaire du marché public a refusé de signer', v('refus_signature')),
  ]
  const dresse = s(d[p ? 'levee_le' : 'opr_le'])
  return {
    cases,
    pointilles: [
      { ancre: 'en l’absence du titulaire du marché public dûment convoqué', valeurs: [fr(v('convocation_le') as string)] },
      { ancre: 'ont été effectuées, à l’exception de celles indiquées', valeurs: [n.epreuve] },
      { ancre: 'et sont concluantes, à l’exception', valeurs: [n.epreuve] },
      { ancre: 'ont été exécutés, à l’exception', valeurs: [n.travaux] },
      { ancre: 'sont conformes aux spécifications du marché public, à l’exception', valeurs: [n.malfacon] },
      { ancre: 'Dressé le', valeurs: [fr(dresse), fr(v('accepte_le') as string)] },
      { ancre: 'Dressé le', rang: 2, valeurs: [v('refus_signature') ? fr(dresse) : ''] },
    ],
  }
}

function specPropositions(d: Donnees, rs: Reserve[], p: 'p_' | 'd_', n: Partial<Record<string, string>>, num: string): Spec {
  const v = (k: string) => valeur(d, rs, p + k)
  const oui = v('reception') !== 'non', m = v('mode')
  const pre = p === 'p_' ? '1.' : '2.'
  void num; void pre
  return {
    cases: [
      c('sans réserve', oui && m === 'sans'), c('sous réserve :', oui && m === 'sous'), c('avec réserve :', oui && m === 'avec'),
      c('de l’exécution concluante des épreuves', oui && m === 'sous' && v('sous_epreuves')),
      c('de l’exécution des travaux et prestations', oui && m === 'sous' && v('sous_travaux')),
      c('le titulaire doit remédier, avant le', oui && m === 'avec' && v('malfacons')),
      c('Toutefois, il est proposé que cette dernière réserve soit levée', oui && m === 'avec' && v('malfacons') && !!v('refaction')),
      c('les installations de chantier doivent été repliées', oui && m === 'avec' && v('lieux')),
      c('les conditions de pose des équipements doivent être mises en conformité', oui && m === 'avec' && v('pose')),
    ],
    pointilles: [
      { ancre: 'de l’exécution concluante des épreuves', valeurs: [n.epreuve] },
      { ancre: 'de l’exécution des travaux et prestations', valeurs: [n.travaux, fr(valeur(d, rs, 'd_sous_travaux_avant') as string)] },
      { ancre: 'le titulaire doit remédier, avant le', valeurs: [fr(v('malfacons_avant') as string), n.malfacon] },
      { ancre: 'les installations de chantier doivent été repliées', valeurs: [fr(v('lieux_avant') as string)] },
      { ancre: 'les conditions de pose des équipements doivent être mises en conformité', valeurs: [fr(v('pose_avant') as string)] },
    ],
    ajouts: v('refaction') ? [{ ancre: 'Toutefois, il est proposé que cette dernière réserve soit levée', texte: `Montant de la réfaction : ${v('refaction')}` }] : [],
  }
}

const signature = (lieu: string, date: unknown, rang?: number) => ({ ancre: 'A :', rang, valeurs: [lieu, fr(date as string)] })
const fusion = (...ss: Spec[]): Spec => ({
  cases: ss.flatMap((x) => x.cases ?? []), pointilles: ss.flatMap((x) => x.pointilles ?? []), ajouts: ss.flatMap((x) => x.ajouts ?? []),
  champs: Object.assign({}, ...ss.map((x) => x.champs ?? {})), remplacements: ss.flatMap((x) => x.remplacements ?? []), annexes: ss.flatMap((x) => x.annexes ?? []),
})

/** Règles de remplissage d'un formulaire à partir des données de la réception. */
export function specExe(code: CodeExe, id: Identite, d: Donnees, rs: Reserve[], lieu = 'Cherbourg-en-Cotentin'): Spec {
  reservesCourantes = rs
  const base: Spec = { champs: champsCommuns(id), remplacements: remplacementsCommuns(id) }
  const v = (k: string) => valeur(d, rs, k)
  if (code === 'EXE4') {
    const a = annexes(rs)
    return fusion(base, objet(id), specConstats(d, rs, '', a.numero), {
      pointilles: [{ ancre: 'Date d’achèvement des travaux proposée par le titulaire', valeurs: [fr(s(d.achevement_propose))] }], annexes: a.liste,
    })
  }
  if (code === 'EXE5') {
    const a = annexes(rs)
    const oui = v('p_reception') !== 'non'
    return fusion(base, specPropositions(d, rs, 'p_', a.numero, '1'), {
      cases: [c('de prononcer la réception', oui), c('de ne pas prononcer la réception', !oui)],
      pointilles: [
        { ancre: 'Au vu du procès-verbal des opérations préalables', valeurs: [fr(s(d.opr_le))] },
        { ancre: 'de prononcer la réception', valeurs: [fr(v('p_achevement') as string)] },
        signature(lieu, v('propositions_le')),
      ],
      annexes: a.liste,
    })
  }
  if (code === 'EXE6') {
    const a = annexes(rs)
    return fusion(base, specPropositions(d, rs, 'd_', a.numero, '2'), {
      cases: [
        c('du procès-verbal des opérations préalables à la réception', true),
        c('de la lettre, en date du', !!s(d.lettre_refaction_le)),
        c('que la date retenue, pour l’achèvement des travaux', true), c('que la réception est prononcée', true),
      ],
      pointilles: [
        { ancre: 'du procès-verbal des opérations préalables à la réception', valeurs: [fr(s(d.opr_le)), fr(v('propositions_le') as string)] },
        { ancre: 'de la lettre, en date du', valeurs: [fr(s(d.lettre_refaction_le))] },
        { ancre: 'que la date retenue, pour l’achèvement des travaux', valeurs: [fr(v('d_achevement') as string)] },
        signature(lieu, d.decision_le),
      ],
      annexes: a.liste,
    })
  }
  if (code === 'EXE7') {
    return fusion(base, {
      pointilles: [{ ancre: 'Au vu du procès-verbal des opérations préalables à la réception', valeurs: [fr(s(d.opr_le)), fr(v('propositions_le') as string)] }, signature(lieu, d.decision_le)],
    })
  }
  if (code === 'EXE8') {
    const restantes = nonLevees(rs)
    const a = annexes(restantes, ' (réserves non levées)')
    return fusion(base, objet(id), specConstats(d, rs, 'l_', a.numero), { annexes: a.liste })
  }
  if (code === 'EXE9') {
    const leveesListe = rs.filter(levee)
    const restantes = nonLevees(rs)
    const aLevees: Annexe = { titre: 'Annexe n° 1 — Réserves levées', entetes: ['N°', 'Désignation', 'Levée le'], largeurs: [1, 8, 2], lignes: leveesListe.map((r) => [r.numero, r.texte, fr(r.soldee_le)]) }
    const autres = annexes(restantes, ' (réserves maintenues)')
    const decalees = autres.liste.map((x, i) => ({ ...x, titre: x.titre.replace(/Annexe n° \d+/, `Annexe n° ${i + 2}`) }))
    const num: Partial<Record<string, string>> = {}
    for (const [k, n] of Object.entries(autres.numero)) num[k] = String(Number(n) + 1)
    const decisionReception = fr(s(d.decision_le))
    const bloc = (p: 'lp_' | 'ld_', prefixe: string, rangBase: number): Spec => {
      const ch = valeur(d, rs, `${p}choix`)
      const vv = (k: string) => valeur(d, rs, p + k)
      const r = rangBase
      const actif = p === 'lp_' || ch !== 'accepter'
      return {
        cases: [
          c(`${prefixe}rapporter la réception`, actif && ch === 'rapporter'), c(`${prefixe}lever toutes les réserves`, actif && ch === 'lever_tout'),
          c(`${prefixe}maintenir l’ensemble des réserves`, actif && ch === 'maintenir'), c('parmi les réserves dont était assortie', actif && ch === 'lever_partie', r),
          c('l’exécution des épreuves énumérées', actif && ch === 'lever_partie' && vv('m_epreuves'), r), c('l’exécution des travaux et prestations listés', actif && ch === 'lever_partie' && vv('m_travaux'), r),
          c('la correction des imperfections et malfaçons', actif && ch === 'lever_partie' && vv('m_malfacons'), r),
          c('les installations de chantier doivent été repliées', actif && ch === 'lever_partie' && vv('m_lieux'), r),
          c('les conditions de pose des équipements doivent être mises en conformité', actif && ch === 'lever_partie' && vv('m_pose'), r),
        ],
        pointilles: [
          { ancre: `${prefixe}rapporter la réception`, valeurs: [decisionReception] }, { ancre: `${prefixe}lever toutes les réserves`, valeurs: [decisionReception] },
          { ancre: `${prefixe}maintenir l’ensemble des réserves`, valeurs: [decisionReception] }, { ancre: 'parmi les réserves dont était assortie', rang: r, valeurs: [decisionReception, '1'] },
          { ancre: 'l’exécution des épreuves énumérées', rang: r, valeurs: [num.epreuve] }, { ancre: 'l’exécution des travaux et prestations listés', rang: r, valeurs: [num.travaux] },
          { ancre: 'la correction des imperfections et malfaçons', rang: r, valeurs: [num.malfacon] },
          { ancre: 'les installations de chantier doivent été repliées', rang: r, valeurs: [fr(vv('m_lieux_avant') as string)] },
          { ancre: 'les conditions de pose des équipements doivent être mises en conformité', rang: r, valeurs: [fr(vv('m_pose_avant') as string)] },
        ],
      }
    }
    const ld = valeur(d, rs, 'ld_choix')
    return fusion(base, objet(id), bloc('lp_', 'de ', 1), bloc('ld_', '', 2), {
      cases: [c('d’accepter toutes les propositions complémentaires', ld === 'accepter'), c('de ne pas retenir les propositions complémentaires', ld !== 'accepter')],
      pointilles: [
        { ancre: 'Au vu du procès-verbal de levée des réserves, en date du', valeurs: [fr(s(d.levee_le))] },
        { ancre: 'Au vu du procès-verbal de levée des réserves, en date du', rang: 2, valeurs: [fr(s(d.levee_le)), fr(v('lp_le') as string)] },
        signature(lieu, v('lp_le')), signature(lieu, d.ld_le, 2),
      ],
      annexes: [aLevees, ...decalees],
    })
  }
  // EXE3 — admission des fournitures courantes
  const q = v('f_qualite')
  return fusion({ champs: champsCommuns(id) }, {
    cases: [
      c('en présence du titulaire du marché public, ou de son représentant', v('f_presence') !== 'non'),
      c('en l’absence du titulaire du marché public, ou de son représentant', v('f_presence') === 'non'),
      c('accepter en l’état les prestations suivantes', !!s(d.f_accepter)),
      c('mettre en demeure le titulaire du marché public', !!s(d.f_reprendre) || !!s(d.f_completer)),
      c('de reprendre l’excédent fourni', !!s(d.f_reprendre)), c('de compléter la livraison', !!s(d.f_completer)),
      c('prononcer l’admission des prestations suivantes', q === 'admission'), c('ajourner l’admission des prestations suivantes', q === 'ajournement'),
      c('admettre les prestations suivantes avec réfaction', q === 'refaction'), c('rejeter les prestations suivantes', q === 'rejet'),
    ],
    pointilles: [
      { ancre: 'Référence du marché public', valeurs: [id.marche] },
      { ancre: 'Bon de commande n°', valeurs: [s(d.bc_numero), fr(s(d.bc_date))] },
      { ancre: 'Nature des prestations objet de la présente décision', valeurs: [s(d.nature)] },
      { ancre: 'Date de livraison prévue', valeurs: [fr(s(d.livraison_prevue))] },
      { ancre: 'Les opérations de vérification ont eu lieu le', valeurs: [fr(s(d.verification_le))] },
      { ancre: 'accepter en l’état les prestations suivantes', valeurs: [s(d.f_accepter)] },
      { ancre: 'de reprendre l’excédent fourni', valeurs: [s(d.f_reprendre)] },
      { ancre: 'de compléter la livraison', valeurs: [s(d.f_completer)] },
      ...(q === 'ajournement' ? [
        { ancre: 'Motifs de la décision d’ajournement', valeurs: [s(d.f_motifs)] }, { ancre: 'Mises au point que doit effectuer', valeurs: [s(d.f_mises_au_point)] },
        { ancre: 'Délai imparti au titulaire pour présenter les prestations mises au point', valeurs: [s(d.f_delai_presenter)] },
        { ancre: 'Délai imparti au titulaire pour faire connaître', valeurs: [s(d.f_delai_acceptation)] },
        { ancre: 'Délai prévu pour procéder aux vérifications', valeurs: [s(d.f_delai_verif)] },
        { ancre: 'Délai imparti au titulaire pour enlever les biens', valeurs: [s(d.f_delai_enlever)] },
      ] : []),
      ...(q === 'refaction' ? [
        { ancre: 'Motifs de la décision d’admission avec réfaction', valeurs: [s(d.f_motifs)] }, { ancre: 'Montant de la réfaction proposée', valeurs: [s(d.f_montant_refaction)] },
        { ancre: 'Délai imparti au titulaire pour présenter ses observations', valeurs: [s(d.f_delai_observations)] },
      ] : []),
      ...(q === 'rejet' ? [
        { ancre: 'Motifs de la décision de rejet', valeurs: [s(d.f_motifs)] },
        { ancre: 'Délai imparti au titulaire pour présenter ses observations', rang: 2, valeurs: [s(d.f_delai_observations)] },
        { ancre: 'Délai imparti au titulaire pour exécuter à nouveau', valeurs: [s(d.f_delai_reexecuter)] },
        { ancre: 'Délai imparti au titulaire pour enlever les prestations rejetées', valeurs: [s(d.f_delai_enlever_rejet)] },
      ] : []),
    ],
    ajouts: s(d.f_prestations) ? [{ ancre: q === 'ajournement' ? 'ajourner l’admission des prestations suivantes' : q === 'refaction' ? 'admettre les prestations suivantes avec réfaction' : q === 'rejet' ? 'rejeter les prestations suivantes' : 'prononcer l’admission des prestations suivantes', texte: s(d.f_prestations) }] : [],
  })
}

/** Formulaires disponibles pour une réception, selon son genre et la décision prise. */
export function formulairesDe(genre: 'travaux' | 'fcs', d: Donnees, rs: Reserve[]): CodeExe[] {
  if (genre === 'fcs') return ['EXE3']
  const decision = valeur(d, rs, 'd_reception')
  return ['EXE4', 'EXE5', decision === 'non' ? 'EXE7' : 'EXE6', 'EXE8', 'EXE9']
}
