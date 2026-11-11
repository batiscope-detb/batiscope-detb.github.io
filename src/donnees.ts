/**
 * Accès aux données Supabase (schémas releves et accessibilite).
 * Seule la clé publiable figure ici : les données sont protégées par la connexion
 * de l'agent et les règles d'accès (RLS) de la base.
 */
import { createClient } from '@supabase/supabase-js'
import type { Diagnostic, Element, Saisie, Statut } from './moteur'

export const SUPABASE_URL = 'https://ldhzmmfxuljzpatvobur.supabase.co'
const CLE_PUBLIABLE = 'sb_publishable_ehckQK8fx5CWBoCXAJZxPQ_mwIVT6Y3'

export const supabase = createClient(SUPABASE_URL, CLE_PUBLIABLE, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'releves-detb-bureau' },
})

// --- Types des tables -----------------------------------------------------------------
export type StatutErp = 'diagnostic' | 'programme' | 'travaux' | 'atteste' | 'archive'
export interface Projet {
  id: string; nom: string; adresse: string | null; contact: string | null; code: string | null; commune_deleguee: string | null
  photo_path: string | null; statut: StatutErp; date_statut: string | null; archive_nom: string | null; archive_le: string | null; archive_sha256?: string | null; archive_par?: string | null
  cree_le: string; maj_le: string; recu_le: string; maj_par: string | null
}
export interface Niveau { id: string; projet_id: string; libelle: string; ordre: number; maj_le?: string }
export interface Local { id: string; projet_id: string; niveau_id: string | null; libelle: string; type: string | null; ordre: number; etat_general: number | null; reserve_personnel?: boolean; maj_le?: string }
export interface Lot { id: string; libelle: string; ordre: number; archive_le: string | null }
export interface Constat {
  id: string; local_id: string; lot_id: string | null; note: string | null; gravite: 'info' | 'a_prevoir' | 'urgent' | null
  estimation: number | null; cree_le: string; maj_le: string; maj_par: string | null
}
export interface PhotoReleve { id: string; constat_id: string; point_controle_id: string | null; storage_path: string | null; ordre: number; maj_le?: string }
export interface PointControle { id: string; lot_id: string; libelle: string; ordre: number; obsolete?: boolean }
export interface TypeLocal { id: string; libelle: string; ordre: number }
export interface ConstatPoint { constat_id: string; point_controle_id: string; note: string | null }
export interface Interaction { constat_id: string; lot_id: string }
export interface PlanNiveau { niveau_id: string; storage_path: string | null; page_index: number; maj_le?: string }
export interface Marqueur { id: string; niveau_id: string; local_id: string; x_relatif: number; y_relatif: number; numero: number; maj_le?: string }
export interface Annotation {
  id: string; niveau_id: string; type: string; x: number; y: number; points: [number, number][] | null; rotation: number
  taille: 's' | 'm' | 'l'; valeur: string | null; commentaire: string | null; couleur: string | null
  lien_type: 'local' | 'constat' | 'element' | null; lien_id: string | null; maj_le?: string
}
export interface AccNiveau { niveau_id: string; accessible_fauteuil: boolean; effectif_public?: number | null; effectif_personnel?: number | null; niveau_acces?: boolean; maj_le?: string }
export interface PhotoAcc { id: string; element_id: string; regle_id: string | null; storage_path: string | null; maj_le?: string }
export interface Derogation {
  id: string; diagnostic_id: string; element_id: string | null; regle_id: string | null; motif: string; sous_motif: string | null
  objet: string; justification: string | null; mesures_substitution: string | null; statut: string; date_depot: string | null; date_decision: string | null
}
export interface SolutionEquivalente { id: string; diagnostic_id: string; element_id: string | null; regle_id: string | null; description: string; objectifs: string | null; statut: string }
export interface Agent { id: string; nom: string; email: string | null; role: string; actif: boolean }
export type { Diagnostic, Element, Saisie, Statut }

// --- Chargement paginé (l'API renvoie au plus 1000 lignes par requête) ----------------------
const PAGE = 1000
type Requete = { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }

async function tout<T>(fabrique: () => Requete): Promise<T[]> {
  const res: T[] = []
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await fabrique().range(debut, debut + PAGE - 1)
    if (error) throw new Error(error.message)
    res.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return res
  }
}
const rel = () => supabase.schema('releves')
const acc = () => supabase.schema('accessibilite')

/** Tout le patrimoine, pour le tableau de bord (quelques milliers de lignes au plus). */
export interface Patrimoine {
  projets: Projet[]; niveaux: Niveau[]; locaux: Local[]; constats: Constat[]; lots: Lot[]
  diagnostics: Diagnostic[]; accNiveaux: AccNiveau[]; elements: Element[]; saisies: Saisie[]; derogations: Derogation[]
  stockage: { projet_id: string; bucket_id: string; nb_fichiers: number; octets: number }[]
  typesLocaux: TypeLocal[]; points: PointControle[]
}

export async function chargerPatrimoine(): Promise<Patrimoine> {
  const [projets, niveaux, locaux, constats, lots, diagnostics, accNiveaux, elements, saisies, derogations, stockage, typesLocaux, points] = await Promise.all([
    tout<Projet>(() => rel().from('projet').select('*').is('supprime_le', null).order('nom') as unknown as Requete),
    tout<Niveau>(() => rel().from('niveau').select('id,projet_id,libelle,ordre,maj_le').is('supprime_le', null).order('ordre') as unknown as Requete),
    tout<Local>(() => rel().from('local').select('id,projet_id,niveau_id,libelle,type,ordre,etat_general,reserve_personnel,maj_le').is('supprime_le', null) as unknown as Requete),
    tout<Constat>(() => rel().from('constat').select('id,local_id,lot_id,note,gravite,estimation,cree_le,maj_le,maj_par').is('supprime_le', null) as unknown as Requete),
    tout<Lot>(() => rel().from('lot').select('id,libelle,ordre,archive_le').is('supprime_le', null).order('ordre') as unknown as Requete),
    tout<Diagnostic>(() => acc().from('diagnostic').select('*').is('supprime_le', null) as unknown as Requete),
    tout<AccNiveau>(() => acc().from('acc_niveau').select('niveau_id,accessible_fauteuil,effectif_public,effectif_personnel,niveau_acces,maj_le').is('supprime_le', null) as unknown as Requete),
    tout<Element>(() => acc().from('element').select('*').is('supprime_le', null) as unknown as Requete),
    tout<Saisie>(() => acc().from('constat').select('element_id,regle_id,mesure,mesure_palier,palier_bool,statut_force,commentaire').is('supprime_le', null) as unknown as Requete),
    tout<Derogation>(() => acc().from('derogation').select('*').is('supprime_le', null) as unknown as Requete),
    supabase.schema('sync').from('v_stockage_par_projet').select('*').then(({ data }) => (data ?? []) as Patrimoine['stockage']),
    tout<TypeLocal>(() => rel().from('type_local').select('id,libelle,ordre').is('supprime_le', null).order('ordre') as unknown as Requete),
    tout<PointControle>(() => rel().from('point_controle').select('id,lot_id,libelle,ordre,obsolete').is('supprime_le', null).order('ordre') as unknown as Requete),
  ])
  return { projets, niveaux, locaux, constats, lots, diagnostics, accNiveaux, elements, saisies, derogations, stockage, typesLocaux, points }
}

/** Détails d'un bâtiment, pour sa fiche (photos, points cochés, plans, repères, dérogations). */
export interface DetailProjet {
  photosReleves: PhotoReleve[]; constatPoints: ConstatPoint[]; plans: PlanNiveau[]; marqueurs: Marqueur[]
  photosAcc: PhotoAcc[]; solutions: SolutionEquivalente[]; agents: Agent[]; annotations: Annotation[]; interactions: Interaction[]
}

export async function chargerDetail(projetId: string, constatIds: string[], niveauIds: string[], elementIds: string[], diagnosticId: string | null): Promise<DetailProjet> {
  const paquets = <T,>(ids: string[], f: (lot: string[]) => Promise<T[]>) =>
    Promise.all(Array.from({ length: Math.ceil(ids.length / 150) }, (_, i) => f(ids.slice(i * 150, i * 150 + 150)))).then((r) => r.flat())
  const [photosReleves, constatPoints, plans, marqueurs, photosAcc, solutions, agents, annotations, interactions] = await Promise.all([
    paquets(constatIds, (lot) => tout<PhotoReleve>(() => rel().from('photo').select('id,constat_id,point_controle_id,storage_path,ordre,maj_le').in('constat_id', lot).is('supprime_le', null) as unknown as Requete)),
    paquets(constatIds, (lot) => tout<ConstatPoint>(() => rel().from('constat_point_controle').select('constat_id,point_controle_id,note').in('constat_id', lot).is('supprime_le', null) as unknown as Requete)),
    paquets(niveauIds, (lot) => tout<PlanNiveau>(() => rel().from('plan_niveau').select('niveau_id,storage_path,page_index,maj_le').in('niveau_id', lot).is('supprime_le', null) as unknown as Requete)),
    paquets(niveauIds, (lot) => tout<Marqueur>(() => rel().from('marqueur_local').select('id,niveau_id,local_id,x_relatif,y_relatif,numero,maj_le').in('niveau_id', lot).is('supprime_le', null) as unknown as Requete)),
    paquets(elementIds, (lot) => tout<PhotoAcc>(() => acc().from('photo').select('id,element_id,regle_id,storage_path,maj_le').in('element_id', lot).is('supprime_le', null) as unknown as Requete)),
    diagnosticId
      ? tout<SolutionEquivalente>(() => acc().from('solution_effet_equivalent').select('*').eq('diagnostic_id', diagnosticId).is('supprime_le', null) as unknown as Requete)
      : Promise.resolve([] as SolutionEquivalente[]),
    tout<Agent>(() => rel().from('agent').select('id,nom,email,role,actif') as unknown as Requete),
    paquets(niveauIds, (lot) => tout<Annotation>(() => rel().from('annotation').select('id,niveau_id,type,x,y,points,rotation,taille,valeur,commentaire,couleur,lien_type,lien_id,maj_le').in('niveau_id', lot).is('supprime_le', null) as unknown as Requete)),
    paquets(constatIds, (lot) => tout<Interaction>(() => rel().from('constat_interaction').select('constat_id,lot_id').in('constat_id', lot).is('supprime_le', null) as unknown as Requete)),
  ])
  void projetId
  return { photosReleves, constatPoints, plans, marqueurs, photosAcc, solutions, agents, annotations, interactions }
}

/** Adresses temporaires (1 h) des fichiers privés d'un bucket. */
export async function urlsSignees(bucket: string, chemins: string[]): Promise<Map<string, string>> {
  const res = new Map<string, string>()
  const uniques = [...new Set(chemins.filter(Boolean))]
  for (let i = 0; i < uniques.length; i += 100) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(uniques.slice(i, i + 100), 3600)
    for (const d of data ?? []) if (d.signedUrl && d.path) res.set(d.path, d.signedUrl)
  }
  return res
}

export const BUCKETS = { photos: 'photos-releves', plans: 'plans-releves', photosAcc: 'photos-accessibilite' } as const

// --- Libellés --------------------------------------------------------------------------------
export const LIBELLE_STATUT_ERP: Record<StatutErp | 'a_diagnostiquer', string> = {
  a_diagnostiquer: 'À diagnostiquer', diagnostic: 'Diagnostic en cours', programme: 'Travaux programmés',
  travaux: 'Travaux en cours', atteste: 'Attesté', archive: 'Archivé',
}
export const LIBELLE_GRAVITE: Record<string, string> = { urgent: 'Urgent', a_prevoir: 'À prévoir', info: 'Info' }

export const euros = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M€`
  : n >= 10_000 ? `${Math.round(n / 1000).toLocaleString('fr-FR')} k€`
  : `${Math.round(n).toLocaleString('fr-FR')} €`
export const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—')
export const octets = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`
  : n >= 1e7 ? `${Math.round(n / 1e6).toLocaleString('fr-FR')} Mo`
  : n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
  : `${Math.round(n / 1e3).toLocaleString('fr-FR')} ko`

// --- Mise à jour en mémoire après une écriture ------------------------------------------------
/** Remplace (ou ajoute) une ligne dans une liste ; la retire si elle est supprimée. */
export function fusionner<T>(liste: T[], ligne: Record<string, unknown>, cle: (t: T) => string): T[] {
  const k = cle(ligne as T)
  const reste = liste.filter((t) => cle(t) !== k)
  if (ligne.supprime_le) return reste
  const ancien = liste.find((t) => cle(t) === k)
  return [...reste, { ...(ancien ?? {}), ...ligne } as T]
}
