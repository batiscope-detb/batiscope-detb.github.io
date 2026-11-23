/**
 * Visibat — accès aux données (schéma visibat de la base Batiscope / Relevés DETB).
 * Même client Supabase et même connexion que Batiscope. Aucune suppression physique :
 * une ligne « supprimée » reçoit une date dans supprime_le.
 */
import { supabase } from '../donnees'
import type { StatutDef } from './regles'

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

/** Tout ce qu'il faut pour travailler sur une opération. */
export interface Dossier {
  operation: Operation; lots: Lot[]; intervenants: Intervenant[]; reunions: Reunion[]; presences: Presence[]
  observations: Observation[]; obsLots: ObservationLot[]; obsIntervenants: ObservationIntervenant[]; suivis: ObservationSuivi[]
  checklists: ObservationChecklist[]; commentaires: ObservationCommentaire[]
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
const actifs = <T extends { supprime_le?: string | null }>(l: T[]) => l.filter((x) => !x.supprime_le)

export const lireStatuts = () => tout<Statut>(() => vb().from('statut').select('*').is('supprime_le', null).order('ordre'))
export const lireAgents = () => tout<Agent>(() => supabase.schema('releves').from('agent').select('id,nom,email,role,actif').order('nom'))
export const lireContacts = () => tout<Contact>(() => vb().from('contact').select('*').is('supprime_le', null).order('nom'))
export const lireGroupes = async () => ({
  groupes: await tout<Groupe>(() => vb().from('groupe').select('*').is('supprime_le', null).order('nom')),
  membres: await tout<GroupeMembre>(() => vb().from('groupe_membre').select('*').is('supprime_le', null)),
})
export const lireOperations = () => tout<Operation>(() => vb().from('operation').select('*').is('supprime_le', null).order('nom'))
/** Réunions de toutes les opérations (pour l'accueil : prochaine réunion, numéro). */
export const lireToutesReunions = () => tout<Reunion>(() => vb().from('reunion').select('id,operation_id,numero,date_reunion,prochaine_date,statut,supprime_le').is('supprime_le', null))
export const lireBatiments = async () => {
  const { data, error } = await supabase.schema('releves').from('projet').select('id,nom,adresse').is('supprime_le', null).order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; nom: string; adresse: string | null }[]
}

export async function chargerDossier(operationId: string): Promise<Dossier> {
  const { data: op, error } = await vb().from('operation').select('*').eq('id', operationId).single()
  if (error) throw new Error(error.message)
  const parOp = <T,>(table: string) => tout<T>(() => vb().from(table).select('*').eq('operation_id', operationId))
  const [lots, intervenants, reunions, observations] = await Promise.all([
    parOp<Lot>('lot'), parOp<Intervenant>('intervenant'), parOp<Reunion>('reunion'), parOp<Observation>('observation'),
  ])
  const idsR = reunions.map((r) => r.id)
  const idsO = observations.map((o) => o.id)
  const parListe = async <T,>(table: string, col: string, ids: string[]) => {
    const res: T[] = []
    for (let i = 0; i < ids.length; i += 200) res.push(...await tout<T>(() => vb().from(table).select('*').in(col, ids.slice(i, i + 200))))
    return res
  }
  const [presences, obsLots, obsIntervenants, suivis, checklists, commentaires] = await Promise.all([
    parListe<Presence>('presence', 'reunion_id', idsR),
    parListe<ObservationLot>('observation_lot', 'observation_id', idsO),
    parListe<ObservationIntervenant>('observation_intervenant', 'observation_id', idsO),
    parListe<ObservationSuivi>('observation_suivi', 'observation_id', idsO),
    parListe<ObservationChecklist>('observation_checklist', 'observation_id', idsO),
    parListe<ObservationCommentaire>('observation_commentaire', 'observation_id', idsO),
  ])
  return {
    operation: op as Operation,
    lots: actifs(lots).sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code, 'fr', { numeric: true })),
    intervenants: actifs(intervenants).sort((a, b) => a.ordre - b.ordre),
    reunions: actifs(reunions).sort((a, b) => a.numero - b.numero),
    presences: actifs(presences), observations: actifs(observations), obsLots: actifs(obsLots), obsIntervenants: actifs(obsIntervenants),
    suivis: actifs(suivis), checklists: actifs(checklists).sort((a, b) => a.ordre - b.ordre), commentaires: actifs(commentaires),
  }
}

// --- Écriture -------------------------------------------------------------------------------
/** Insère ou met à jour une ligne (l'identifiant est créé côté appli pour fonctionner hors ligne plus tard). */
export async function enregistrer<R = Record<string, unknown>>(table: string, ligne: Record<string, unknown>): Promise<R & { id: string }> {
  const l = { ...ligne, id: (ligne.id as string | undefined) ?? crypto.randomUUID(), maj_le: new Date().toISOString() }
  const { data, error } = await vb().from(table).upsert(l).select().single()
  if (error) throw new Error(error.message)
  return data as R & { id: string }
}
/** Mise à jour partielle d'une ligne existante. */
export async function modifier(table: string, id: string, champs: Record<string, unknown>) {
  const { error } = await vb().from(table).update({ ...champs, maj_le: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
/** Suppression logique. */
export async function supprimer(table: string, id: string) {
  const { error } = await vb().from(table).update({ supprime_le: new Date().toISOString(), maj_le: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
