/**
 * Organisation des observations d'une réunion en rubriques, comme dans le CR DETB :
 * remarques générales, puis intervenants (hors entreprises), puis lots.
 * Une observation associée à plusieurs lots apparaît sous chacun.
 */
import type { Contact, Dossier, Observation, Reunion, Statut } from './donnees'
import { comparerNumeros, observationsDeLaReunion } from './regles'
import { nomComplet } from './composants/FicheContact'

export interface Rubrique { cle: string; titre: string; sousTitre?: string; lotId?: string; observations: Observation[] }

export function observationsVisibles(dossier: Dossier, reunion: Reunion, statuts: Statut[]): Observation[] {
  const soldant = new Set(statuts.filter((s) => s.soldant).map((s) => s.code))
  const soldeeIci = (o: Observation) => dossier.suivis.some((s) => s.observation_id === o.id && s.reunion_id === reunion.id && soldant.has(s.statut_code))
  return observationsDeLaReunion(dossier.observations, reunion, dossier.reunions, statuts, soldeeIci)
}

/** Dans une rubrique, les points « pour mémoire » restent en tête, puis l'ordre des numéros. */
export function trierRubrique(obs: Observation[]): Observation[] {
  return [...obs].sort((a, b) => Number(b.statut_code === 'memoire') - Number(a.statut_code === 'memoire') || comparerNumeros(a.numero, b.numero))
}

export function rubriques(dossier: Dossier, observations: Observation[], contacts: Contact[]): Rubrique[] {
  return rubriquesBrutes(dossier, observations, contacts).map((g) => ({ ...g, observations: trierRubrique(g.observations) }))
}

function rubriquesBrutes(dossier: Dossier, observations: Observation[], contacts: Contact[]): Rubrique[] {
  const res: Rubrique[] = []
  const lotsDe = (o: Observation) => dossier.obsLots.filter((x) => x.observation_id === o.id).map((x) => x.lot_id)
  const intervDe = (o: Observation) => dossier.obsIntervenants.filter((x) => x.observation_id === o.id).map((x) => x.intervenant_id)
  const contactDe = (intervenantId: string) => contacts.find((c) => c.id === dossier.intervenants.find((i) => i.id === intervenantId)?.contact_id)

  res.push({ cle: 'generales', titre: 'Remarques générales', observations: observations.filter((o) => o.rubrique === 'generale') })

  const parIntervenant = new Map<string, Observation[]>()
  for (const o of observations.filter((x) => x.rubrique === 'intervenant')) for (const i of intervDe(o)) parIntervenant.set(i, [...(parIntervenant.get(i) ?? []), o])
  for (const [i, obs] of parIntervenant) {
    const c = contactDe(i)
    res.push({ cle: `i-${i}`, titre: `${nomComplet(c)}${c?.societe ? ` (${c.societe})` : ''}`, observations: obs })
  }

  for (const l of dossier.lots) {
    const obs = observations.filter((o) => o.rubrique === 'lot' && lotsDe(o).includes(l.id))
    const entreprises = dossier.intervenants.filter((i) => i.categorie === 'entreprise' && i.lot_id === l.id).map((i) => contactDe(i.id)).filter(Boolean)
      .map((c) => `${c!.societe ?? ''} - ${nomComplet(c)}`).join(', ')
    res.push({ cle: `l-${l.id}`, titre: `${l.code} ${l.libelle}`, sousTitre: entreprises ? `Intervenants associés : ${entreprises}` : undefined, lotId: l.id, observations: obs })
  }
  const sansRubrique = observations.filter((o) =>
    (o.rubrique === 'lot' && lotsDe(o).length === 0) || (o.rubrique === 'intervenant' && intervDe(o).length === 0))
  if (sansRubrique.length) res.push({ cle: 'autres', titre: 'Autres observations', observations: sansRubrique })
  return res
}
