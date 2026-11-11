/** Vérifications périodiques réglementaires d'un ERP (arrêté du 25 juin 1980 et textes particuliers). */
import type { Verification } from './donnees'

/** Catalogue proposé à la saisie : périodicité usuelle, modifiable fiche par fiche. */
export const CATALOGUE: { type: string; mois: number; note: string }[] = [
  { type: 'Installations électriques', mois: 12, note: 'Vérification périodique (EL 19) — organisme agréé ou technicien compétent selon la catégorie' },
  { type: 'Éclairage de sécurité', mois: 12, note: 'EC 15 ; essais et entretien par l’exploitant entre deux visites' },
  { type: 'Système de sécurité incendie / alarme', mois: 12, note: 'MS 73 ; SSI de catégorie A ou B : vérification triennale par organisme agréé' },
  { type: 'Désenfumage', mois: 12, note: 'DF 10' },
  { type: 'Extincteurs', mois: 12, note: 'MS 38 — vérification annuelle' },
  { type: 'Robinets d’incendie armés (RIA)', mois: 12, note: 'MS 73' },
  { type: 'Chauffage, ventilation, gaz', mois: 12, note: 'CH 58 / GZ 30' },
  { type: 'Appareils de cuisson', mois: 12, note: 'GC 22' },
  { type: 'Ascenseur — contrôle technique', mois: 60, note: 'Contrôle quinquennal (R. 134-11 CCH) ; entretien selon contrat' },
  { type: 'Portes et portails automatiques', mois: 6, note: 'Visite semestrielle' },
  { type: 'Équipements sportifs (buts, paniers)', mois: 12, note: 'Décret du 4 juin 1996' },
  { type: 'Aires collectives de jeux', mois: 12, note: 'Contrôle annuel de l’aire et des équipements' },
  { type: 'Eau chaude sanitaire — légionelles', mois: 12, note: 'Analyses annuelles a minima dans les ERP disposant de points d’usage à risque' },
  { type: 'Paratonnerre', mois: 12, note: 'Vérification visuelle annuelle, complète tous les deux ans' },
  { type: 'Visite de la commission de sécurité', mois: 36, note: 'Périodicité selon le type et la catégorie (GE 4)' },
]

/** Prochaine échéance : date saisie, sinon dernière vérification + périodicité. */
export function prochaine(v: Pick<Verification, 'derniere_date' | 'prochaine_date' | 'periodicite_mois'>): string | null {
  if (v.prochaine_date) return v.prochaine_date
  if (!v.derniere_date || !v.periodicite_mois) return null
  const d = new Date(v.derniere_date + 'T12:00:00')
  d.setMonth(d.getMonth() + v.periodicite_mois)
  return d.toISOString().slice(0, 10)
}

export type EtatEcheance = 'retard' | 'proche' | 'ok' | 'inconnue'
export function echeance(v: Verification, aujourdhui = new Date()): { date: string | null; etat: EtatEcheance; jours: number | null } {
  const date = prochaine(v)
  if (!date) return { date, etat: 'inconnue', jours: null }
  const j = Math.round((new Date(date + 'T12:00:00').getTime() - aujourdhui.getTime()) / 86400000)
  return { date, etat: j < 0 ? 'retard' : j <= 60 ? 'proche' : 'ok', jours: j }
}
