import { createContext, useContext } from 'react'
import type { Affectation, Agent, Contact, Direction, Groupe, GroupeMembre, Statut } from './donnees'

/** Données de référence de Visibat, chargées une fois à l'ouverture du module. */
export interface CtxVisibat {
  moi: Agent
  agents: Agent[]
  statuts: Statut[]
  contacts: Contact[]
  groupes: Groupe[]
  membres: GroupeMembre[]
  directions: Direction[]
  affectations: Affectation[]
  /** Direction de l'agent connecté (ou la première, à défaut). */
  maDirection: Direction | null
  rechargerContacts: () => Promise<void>
  rechargerReferentiels: () => Promise<void>
}
export const ContexteVisibat = createContext<CtxVisibat | null>(null)
export function useVisibat(): CtxVisibat {
  const c = useContext(ContexteVisibat)
  if (!c) throw new Error('Contexte Visibat absent')
  return c
}
export const statutDe = (statuts: Statut[], code: string) => statuts.find((s) => s.code === code)
/** Direction d'un agent. */
export const directionDe = (c: Pick<CtxVisibat, 'directions' | 'affectations'>, agentId: string | null | undefined) =>
  c.directions.find((d) => d.id === c.affectations.find((a) => a.agent_id === agentId)?.direction_id) ?? null
