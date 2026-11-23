/**
 * Règles métier de Visibat, sans accès aux données : numérotation des observations,
 * report des points non soldés d'une réunion à la suivante, cumul des absences.
 * Testées dans src/__tests__/regles.test.ts.
 */

export interface StatutDef { code: string; libelle: string; couleur: string; ordre: number; reporte: boolean; soldant: boolean; date_demandee: string }

export interface ObsRegle {
  id: string
  numero: string
  reunion_id: string | null
  statut_code: string
  soldee_le: string | null
  supprime_le?: string | null
}
export interface ReunionRegle { id: string; numero: number; date_reunion: string }

/** Numéro de la prochaine observation d'une réunion : « 94.3 » (0.x pour les points permanents). */
export function prochainNumero(numeroReunion: number, existants: string[]): string {
  const prefixe = `${numeroReunion}.`
  let max = 0
  for (const n of existants) {
    if (!n.startsWith(prefixe)) continue
    const k = Number(n.slice(prefixe.length))
    if (Number.isFinite(k) && k > max) max = k
  }
  return `${prefixe}${max + 1}`
}

/** Tri naturel des numéros : 0.2 < 0.10 < 93.1 < 93.2 < 94.1. */
export function comparerNumeros(a: string, b: string): number {
  const [a1, a2] = a.split('.').map(Number)
  const [b1, b2] = b.split('.').map(Number)
  return a1 - b1 || (a2 || 0) - (b2 || 0)
}

/**
 * Observations à afficher dans une réunion :
 * - créées dans cette réunion ;
 * - créées avant (ou permanentes) et encore ouvertes à la date de la réunion (statut reporté, non soldées avant elle) ;
 * - soldées pendant cette réunion (affichées une dernière fois).
 */
export function observationsDeLaReunion<T extends ObsRegle>(
  observations: T[], reunion: ReunionRegle, reunions: ReunionRegle[], statuts: StatutDef[],
  soldeeDansReunion: (o: T) => boolean = () => false,
): T[] {
  const numeroDe = new Map(reunions.map((r) => [r.id, r.numero]))
  const reporte = new Map(statuts.map((s) => [s.code, s.reporte && !s.soldant]))
  return observations
    .filter((o) => !o.supprime_le)
    .filter((o) => {
      const creeDans = o.reunion_id ? numeroDe.get(o.reunion_id) ?? 0 : 0
      if (creeDans > reunion.numero) return false // créée plus tard
      if (o.reunion_id === reunion.id) return true
      if (soldeeDansReunion(o)) return true
      if (o.soldee_le && o.soldee_le < reunion.date_reunion.slice(0, 10)) return false
      return reporte.get(o.statut_code) ?? true
    })
    .sort((a, b) => comparerNumeros(a.numero, b.numero))
}

export type Etat = 'P' | 'E' | 'A' | 'N'
export const ETATS: { code: Etat; libelle: string; couleur: string }[] = [
  { code: 'P', libelle: 'Présent', couleur: '#2e7d4f' },
  { code: 'E', libelle: 'Excusé', couleur: '#1d5fa8' },
  { code: 'A', libelle: 'Absent', couleur: '#c2560f' },
  { code: 'N', libelle: 'Absent non excusé', couleur: '#8c1d18' },
]

/** État suivant au toucher : vide → P → E → A → N → vide. */
export function etatSuivant(e: Etat | null): Etat | null {
  const ordre: (Etat | null)[] = [null, 'P', 'E', 'A', 'N']
  return ordre[(ordre.indexOf(e) + 1) % ordre.length]
}

/** Cumul des absences non excusées d'un intervenant jusqu'à une réunion incluse. */
export function cumulAbsences(
  presences: { reunion_id: string; intervenant_id: string; etat: string | null }[],
  intervenantId: string, reunions: ReunionRegle[], jusquA: number,
): number {
  const numeroDe = new Map(reunions.map((r) => [r.id, r.numero]))
  return presences.filter((p) => p.intervenant_id === intervenantId && p.etat === 'N' && (numeroDe.get(p.reunion_id) ?? Infinity) <= jusquA).length
}

/** Montant des pénalités d'absence (cumul × montant unitaire du CCAP). */
export function penaliteAbsences(cumul: number, montantUnitaire: number | null): number {
  return cumul * (montantUnitaire ?? 0)
}

/** Échéance dépassée à une date donnée (ISO). */
export function enRetard(echeance: string | null, statutSoldant: boolean, aujourdhui: string): boolean {
  return !!echeance && !statutSoldant && echeance < aujourdhui
}

export const TYPES_INTERVENANT: { code: string; libelle: string }[] = [
  { code: 'entreprise', libelle: 'Entreprise' },
  { code: 'moa', libelle: 'MOA' },
  { code: 'moe', libelle: 'MOE' },
  { code: 'moa_moe', libelle: 'MOA / MOE' },
  { code: 'bureau_controle', libelle: 'Bureau de contrôle' },
  { code: 'csps', libelle: 'CSPS' },
  { code: 'exploitant', libelle: 'Exploitant' },
  { code: 'support', libelle: 'Service support' },
  { code: 'autre', libelle: 'Autre' },
]
export const libelleType = (c: string) => TYPES_INTERVENANT.find((t) => t.code === c)?.libelle ?? c

/** Ordre des rubriques du CR, comme dans le modèle DETB. */
export const ORDRE_CATEGORIES = ['entreprise', 'bureau_controle', 'exploitant', 'moa_moe', 'moa', 'moe', 'csps', 'support', 'autre']
