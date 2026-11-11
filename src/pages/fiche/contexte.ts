import { createContext, useContext } from 'react'
import type { Constat, Derogation, DetailProjet, Local, Niveau, Patrimoine } from '../../donnees'
import type { IndicateursErp } from '../../calculs'

export interface Fiche {
  ind: IndicateursErp
  p: Patrimoine
  niveaux: Niveau[]
  locaux: Local[]
  constats: Constat[]
  derogations: Derogation[]
  detail: DetailProjet | null
  majDetail: (f: (d: DetailProjet) => DetailProjet) => void
  urls: Map<string, string>
  ajouterUrls: (bucket: string, chemins: string[]) => Promise<void>
  agents: Map<string, string>
  edition: boolean
  modifier: (f: (p: Patrimoine) => Patrimoine) => void
}

export const ContexteFiche = createContext<Fiche | null>(null)
export const useFiche = () => useContext(ContexteFiche)!

export const couleurEtat = (n: number | null | undefined) => (n == null ? '#5D5A82' : n >= 7 ? '#2E7D32' : n >= 4 ? '#C88A12' : '#B3261E')
