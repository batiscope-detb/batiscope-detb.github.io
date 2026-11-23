/**
 * Visibat — accès aux données (schéma visibat de la base Batiscope / Relevés DETB).
 * Même client Supabase et même connexion que Batiscope. Aucune suppression physique :
 * une ligne « supprimée » reçoit une date dans supprime_le.
 */
import { supabase } from '../donnees'
import type { StatutDef } from './regles'
import { ecrireOuDiffere, lireAvecCopie, lireFile, superposer } from './horsligne'

export const vb = () => supabase.schema('visibat')

// --- Types ---------------------------------------------------------------------------------
interface Base { id: string; maj_le?: string; supprime_le?: string | null }
export interface Agent { id: string; nom: string; email: string | null; role: string; actif: boolean }
export type Statut = StatutDef & { id: string }
export interface Groupe extends Base { nom: string }
export interface GroupeMembre extends Base { groupe_id: string; agent_id: string }
export interface Contact extends Base {
  nom: string; prenom: string | null; fonction: string | null; societe: string | null; type_intervenant: string
  telephone: string | null; mobile: string | null; email: string | null; adresse: string | null; notes: string | null
}
export interface Operation extends Base {
  nom: string; objet: string | null; adresse: string | null; projet_id: string | null; proprietaire_id: string | null
  groupe_id: string | null; debut_travaux: string | null; objectif_reception: string | null; photo_path: string | null
  penalite_absence: number | null; clause_diffusion: string | null; planning_actif: boolean; planning: unknown; archive: boolean
}
export interface Lot extends Base { operation_id: string; code: string; libelle: string; couleur: string | null; marche: string | null; ordre: number }
export interface Intervenant extends Base {
  operation_id: string; contact_id: string; categorie: string; lot_id: string | null; diffusion: boolean; convoque_defaut: boolean; ordre: number
}
export interface Reunion extends Base {
  operation_id: string; numero: number; date_reunion: string; lieu: string | null; prochaine_date: string | null
  prochaine_lieu: string | null; statut: 'brouillon' | 'cloturee' | 'diffusee'; diffusee_le: string | null
}
export interface Presence extends Base { reunion_id: string; intervenant_id: string; etat: 'P' | 'E' | 'A' | 'N' | null; convoque: boolean }
export interface Observation extends Base {
  operation_id: string; reunion_id: string | null; numero: string; rubrique: 'generale' | 'intervenant' | 'lot'; texte: string
  statut_code: string; date_statut: string | null; echeance: string | null; date_intervention: string | null
  a_charge_de: string | null; soldee_le: string | null; ordre: number; cree_le?: string
}
export interface ObservationLot extends Base { observation_id: string; lot_id: string }
export interface ObservationIntervenant extends Base { observation_id: string; intervenant_id: string }
export interface ObservationSuivi extends Base { observation_id: string; reunion_id: string; statut_code: string; complement: string | null }
export interface ObservationChecklist extends Base { observation_id: string; libelle: string; fait: boolean; ordre: number }
export interface ObservationCommentaire extends Base { observation_id: string; agent_id: string | null; texte: string; cree_le?: string }
export interface Plan extends Base { operation_id: string; libelle: string; storage_path: string; page_index: number; ordre: number; bucket: 'visibat' | 'plans-releves'; niveau_id: string | null }
export interface Position extends Base { observation_id: string; plan_id: string; x: number; y: number }
/** Symbole ou annotation dessiné sur un plan (même contenu que releves.annotation, rangé dans « donnees »). */
export interface PlanAnnotation extends Base { plan_id: string; donnees: Record<string, unknown> }
export interface Photo extends Base { observation_id: string; storage_path: string; legende: string | null; ordre: number }

/** Tout ce qu'il faut pour travailler sur une opération. */
export interface Dossier {
  operation: Operation; lots: Lot[]; intervenants: Intervenant[]; reunions: Reunion[]; presences: Presence[]
  observations: Observation[]; obsLots: ObservationLot[]; obsIntervenants: ObservationIntervenant[]; suivis: ObservationSuivi[]
  checklists: ObservationChecklist[]; commentaires: ObservationCommentaire[]
  plans: Plan[]; positions: Position[]; photos: Photo[]; annotations: PlanAnnotation[]
}

// --- Lecture --------------------------------------------------------------------------------
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

export interface ModeleExport extends Base { nom: string; description: string | null; portee: 'systeme' | 'groupe' | 'perso' | 'dernier'; proprietaire_id: string | null; groupe_id: string | null; reglages: unknown; ordre: number }

/** Lecture d'une table entière : copie gardée sur l'appareil + écritures en attente superposées. */
async function liste<T extends { id: string }>(cle: string, table: string, f: () => Promise<T[]>): Promise<T[]> {
  const v = await lireAvecCopie(cle, f)
  return superposer(await lireFile(), table, v)
}
export const lireModeles = () => liste<ModeleExport>('modeles', 'modele_export', () => tout(() => vb().from('modele_export').select('*').is('supprime_le', null).order('ordre')))
export const lireStatuts = () => liste<Statut>('statuts', 'statut', () => tout(() => vb().from('statut').select('*').is('supprime_le', null).order('ordre')))
export const lireAgents = () => lireAvecCopie('agents', () => tout<Agent>(() => supabase.schema('releves').from('agent').select('id,nom,email,role,actif').order('nom')))
export const lireContacts = async () => (await liste<Contact>('contacts', 'contact', () => tout(() => vb().from('contact').select('*').is('supprime_le', null).order('nom'))))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
export const lireGroupes = async () => ({
  groupes: await liste<Groupe>('groupes', 'groupe', () => tout(() => vb().from('groupe').select('*').is('supprime_le', null).order('nom'))),
  membres: await liste<GroupeMembre>('membres', 'groupe_membre', () => tout(() => vb().from('groupe_membre').select('*').is('supprime_le', null))),
})
export const lireOperations = async () => (await liste<Operation>('operations', 'operation', () => tout(() => vb().from('operation').select('*').is('supprime_le', null).order('nom'))))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
/** Réunions de toutes les opérations (pour l'accueil : prochaine réunion, numéro). */
export const lireToutesReunions = () => liste<Reunion>('reunions', 'reunion', () => tout(() => vb().from('reunion').select('id,operation_id,numero,date_reunion,prochaine_date,statut,supprime_le').is('supprime_le', null)))
/** Bâtiments du patrimoine Batiscope (pour rattacher une opération). */
export const lireBatiments = () => lireAvecCopie('batiments', async () => {
  const { data, error } = await supabase.schema('releves').from('projet').select('id,nom,adresse,photo_path,maj_le').is('supprime_le', null).order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; nom: string; adresse: string | null; photo_path: string | null; maj_le: string | null }[]
})

async function chargerDossierServeur(operationId: string): Promise<Dossier> {
  const { data: op, error } = await vb().from('operation').select('*').eq('id', operationId).single()
  if (error) throw new Error(error.message)
  const parOp = <T,>(table: string) => tout<T>(() => vb().from(table).select('*').eq('operation_id', operationId))
  const [lots, intervenants, reunions, observations, plans] = await Promise.all([
    parOp<Lot>('lot'), parOp<Intervenant>('intervenant'), parOp<Reunion>('reunion'), parOp<Observation>('observation'), parOp<Plan>('plan'),
  ])
  const idsR = reunions.map((r) => r.id)
  const idsP = plans.map((p) => p.id)
  const idsO = observations.map((o) => o.id)
  const parListe = async <T,>(table: string, col: string, ids: string[]) => {
    const res: T[] = []
    for (let i = 0; i < ids.length; i += 200) res.push(...await tout<T>(() => vb().from(table).select('*').in(col, ids.slice(i, i + 200))))
    return res
  }
  const [presences, obsLots, obsIntervenants, suivis, checklists, commentaires, positions, photos, annotations] = await Promise.all([
    parListe<Presence>('presence', 'reunion_id', idsR),
    parListe<ObservationLot>('observation_lot', 'observation_id', idsO),
    parListe<ObservationIntervenant>('observation_intervenant', 'observation_id', idsO),
    parListe<ObservationSuivi>('observation_suivi', 'observation_id', idsO),
    parListe<ObservationChecklist>('observation_checklist', 'observation_id', idsO),
    parListe<ObservationCommentaire>('observation_commentaire', 'observation_id', idsO),
    parListe<Position>('observation_position', 'observation_id', idsO),
    parListe<Photo>('observation_photo', 'observation_id', idsO),
    parListe<PlanAnnotation>('plan_annotation', 'plan_id', idsP),
  ])
  return {
    operation: op as Operation, lots, intervenants, reunions, presences, observations, obsLots, obsIntervenants,
    suivis, checklists, commentaires, plans, positions, photos, annotations,
  }
}

/** Écritures en attente superposées, lignes supprimées retirées, tris. */
export function finaliserDossier(d: Dossier, file: Parameters<typeof superposer>[0]): Dossier {
  const id = d.operation.id
  const [operation] = superposer(file, 'operation', [d.operation])
  const lots = superposer(file, 'lot', d.lots, (l) => l.operation_id === id)
  const intervenants = superposer(file, 'intervenant', d.intervenants, (l) => l.operation_id === id)
  const reunions = superposer(file, 'reunion', d.reunions, (l) => l.operation_id === id)
  const plans = superposer(file, 'plan', d.plans, (l) => l.operation_id === id)
  const observations = superposer(file, 'observation', d.observations, (l) => l.operation_id === id)
  const R = new Set(reunions.map((x) => x.id)); const O = new Set(observations.map((x) => x.id)); const P = new Set(plans.map((x) => x.id))
  const parObs = (l: Record<string, unknown>) => O.has(l.observation_id as string)
  return {
    operation: operation ?? d.operation,
    lots: lots.sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code, 'fr', { numeric: true })),
    intervenants: intervenants.sort((a, b) => a.ordre - b.ordre),
    reunions: reunions.sort((a, b) => a.numero - b.numero),
    presences: superposer(file, 'presence', d.presences, (l) => R.has(l.reunion_id as string)),
    observations,
    obsLots: superposer(file, 'observation_lot', d.obsLots, parObs),
    obsIntervenants: superposer(file, 'observation_intervenant', d.obsIntervenants, parObs),
    suivis: superposer(file, 'observation_suivi', d.suivis, parObs),
    checklists: superposer(file, 'observation_checklist', d.checklists, parObs).sort((a, b) => a.ordre - b.ordre),
    commentaires: superposer(file, 'observation_commentaire', d.commentaires, parObs),
    plans: plans.sort((a, b) => a.ordre - b.ordre),
    positions: superposer(file, 'observation_position', d.positions, parObs).map((p) => ({ ...p, x: Number(p.x), y: Number(p.y) })),
    photos: superposer(file, 'observation_photo', d.photos, parObs).sort((a, b) => a.ordre - b.ordre),
    annotations: superposer(file, 'plan_annotation', d.annotations, (l) => P.has(l.plan_id as string)),
  }
}

/** Tout le contenu d'une opération ; gardé sur l'appareil pour la saisie hors ligne. */
export async function chargerDossier(operationId: string): Promise<Dossier> {
  const d = await lireAvecCopie(`dossier:${operationId}`, () => chargerDossierServeur(operationId))
  return finaliserDossier(d, await lireFile())
}

// --- Écriture -------------------------------------------------------------------------------
// Hors ligne, l'écriture est mise en file et la ligne locale est rendue : l'écran se met à jour tout de suite.
/** Insère ou met à jour une ligne (l'identifiant est créé côté appli, ce qui permet la saisie hors ligne). */
export async function enregistrer<R = Record<string, unknown>>(table: string, ligne: Record<string, unknown>): Promise<R & { id: string }> {
  const l = { ...ligne, id: (ligne.id as string | undefined) ?? crypto.randomUUID(), maj_le: new Date().toISOString() }
  const r = await ecrireOuDiffere({ genre: 'enregistrer', table, id: l.id, ligne: l }, async () => {
    const { data, error } = await vb().from(table).upsert(l).select().single()
    if (error) throw new Error(error.message)
    return data as R & { id: string }
  })
  return r ?? (l as unknown as R & { id: string })
}
/** Mise à jour partielle d'une ligne existante. */
export async function modifier(table: string, id: string, champs: Record<string, unknown>) {
  const c = { ...champs, maj_le: new Date().toISOString() }
  await ecrireOuDiffere({ genre: 'modifier', table, id, ligne: c }, async () => {
    const { error } = await vb().from(table).update(c).eq('id', id)
    if (error) throw new Error(error.message)
  })
}
/** Suppression logique. */
export async function supprimer(table: string, id: string) {
  const c = { supprime_le: new Date().toISOString(), maj_le: new Date().toISOString() }
  await ecrireOuDiffere({ genre: 'supprimer', table, id, ligne: c }, async () => {
    const { error } = await vb().from(table).update(c).eq('id', id)
    if (error) throw new Error(error.message)
  })
}

// --- Fichiers ---------------------------------------------------------------------------------
export const BUCKET = 'visibat'

/** Plans du bâtiment Batiscope (un par niveau), pour les reprendre dans l'opération. */
export async function plansDuBatiment(projetId: string) {
  const { data: niveaux, error: e1 } = await supabase.schema('releves').from('niveau').select('id,libelle,ordre').eq('projet_id', projetId).is('supprime_le', null).order('ordre')
  if (e1) throw new Error(e1.message)
  const ids = (niveaux ?? []).map((n) => n.id as string)
  if (!ids.length) return []
  const { data: plans, error: e2 } = await supabase.schema('releves').from('plan_niveau').select('niveau_id,storage_path,page_index').in('niveau_id', ids).is('supprime_le', null)
  if (e2) throw new Error(e2.message)
  return (plans ?? []).filter((p) => p.storage_path).map((p) => ({
    niveau_id: p.niveau_id as string, storage_path: p.storage_path as string, page_index: (p.page_index as number) ?? 0,
    libelle: (niveaux ?? []).find((n) => n.id === p.niveau_id)?.libelle as string ?? 'Niveau',
  }))
}
