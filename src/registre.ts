/** Registre public d'accessibilité (arrêté du 19 avril 2017) : données saisies et éléments tirés du diagnostic. */
import { supabase } from './donnees'
import type { IndicateursErp } from './calculs'
import type { Derogation } from './donnees'

export interface Registre {
  projet_id: string; prestations: string | null; prestations_non_accessibles: string | null; materiel_adapte: string | null
  maintenance: string | null; formation_personnel: string | null; attestation_formation_le: string | null; contact: string | null
  lieu_consultation: string | null; attestation_accessibilite_le: string | null; agenda_reference: string | null; document_accueil: boolean; maj_le?: string
}

export const registreVide = (projetId: string): Registre => ({
  projet_id: projetId, prestations: null, prestations_non_accessibles: null, materiel_adapte: null, maintenance: null, formation_personnel: null,
  attestation_formation_le: null, contact: null, lieu_consultation: null, attestation_accessibilite_le: null, agenda_reference: null, document_accueil: false,
})

export async function chargerRegistre(projetId: string): Promise<Registre | null> {
  const { data, error } = await supabase.schema('accessibilite').from('registre').select('*').eq('projet_id', projetId).is('supprime_le', null).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Registre | null) ?? null
}

const TYPES_MAINTENANCE: Record<string, string> = {
  Ascenseur: 'ascenseur', 'Élévateur': 'élévateur', 'Rampe amovible': 'rampe amovible', 'Porte automatique': 'porte automatique',
  'Boucle magnétique': 'boucle magnétique', 'Commande / interphone': 'interphone', Interphone: 'interphone',
}
const TYPES_MATERIEL: Record<string, string> = { 'Boucle magnétique': 'boucle à induction magnétique', 'Équipement mobile': 'équipement mobile' }

/** Propositions tirées du diagnostic (pour préremplir les rubriques encore vides). */
export function propositions(ind: IndicateursErp) {
  const types = new Set(ind.elements.map((e) => e.element.element_type))
  const equipements = [...new Set([...types].map((t) => TYPES_MAINTENANCE[t]).filter(Boolean))]
  const materiel = [...new Set([...types].map((t) => TYPES_MATERIEL[t]).filter(Boolean))]
  return {
    maintenance: equipements.length
      ? `Équipements d'accessibilité : ${equipements.join(', ')}. Entretien assuré dans le cadre des contrats de maintenance de la Ville ; signaler toute panne à l'accueil.`
      : null,
    materiel_adapte: materiel.length ? `À disposition : ${materiel.join(', ')}.` : null,
  }
}

/** Niveau d'accessibilité en langage clair, par séquence du parcours. */
export function niveauAccessibilite(ind: IndicateursErp, derogations: Derogation[]): { accessible: string[]; nonAccessible: string[]; derogations: string[] } {
  const parSeq = new Map<string, { nc: number; ok: number }>()
  for (const e of ind.elements) {
    const s = parSeq.get(e.element.sequence) ?? { nc: 0, ok: 0 }
    s.nc += e.synthese.nonConformes; s.ok += e.synthese.conformes + e.synthese.sousTolerance
    parSeq.set(e.element.sequence, s)
  }
  const libelle = (seq: string) => seq.replace(/^\d+\s*/, '')
  const accessible: string[] = [], nonAccessible: string[] = []
  for (const [seq, s] of [...parSeq.entries()].sort()) (s.nc ? nonAccessible : accessible).push(libelle(seq))
  const accordees = derogations.filter((d) => d.statut === 'accordee').map((d) => `${d.objet}${d.date_decision ? ` (dérogation accordée le ${new Date(d.date_decision).toLocaleDateString('fr-FR')})` : ''}`)
  return { accessible, nonAccessible, derogations: accordees }
}
