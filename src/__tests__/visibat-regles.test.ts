import { describe, expect, it } from 'vitest'
import { comparerNumeros, cumulAbsences, enRetard, etatSuivant, observationsDeLaReunion, penaliteAbsences, prochainNumero, type StatutDef } from '../visibat/regles'

const statuts: StatutDef[] = [
  { code: 'memoire', libelle: 'Pour mémoire', couleur: '', ordre: 1, reporte: true, soldant: false, date_demandee: 'aucune' },
  { code: 'nouvelle', libelle: 'Nouvelle', couleur: '', ordre: 2, reporte: true, soldant: false, date_demandee: 'echeance' },
  { code: 'soldee', libelle: 'Soldée', couleur: '', ordre: 7, reporte: false, soldant: true, date_demandee: 'constat' },
]
const reunions = [
  { id: 'r92', numero: 92, date_reunion: '2025-10-16T09:00:00Z' },
  { id: 'r93', numero: 93, date_reunion: '2025-10-30T09:00:00Z' },
  { id: 'r94', numero: 94, date_reunion: '2025-11-06T09:00:00Z' },
]

describe('numérotation', () => {
  it('incrémente dans la réunion', () => {
    expect(prochainNumero(94, ['93.1', '94.1', '94.2', '0.5'])).toBe('94.3')
    expect(prochainNumero(94, [])).toBe('94.1')
    expect(prochainNumero(0, ['0.9', '0.10'])).toBe('0.11')
  })
  it('trie naturellement', () => {
    expect(['94.1', '0.10', '93.2', '0.2', '93.10'].sort(comparerNumeros)).toEqual(['0.2', '0.10', '93.2', '93.10', '94.1'])
  })
})

describe('report des observations', () => {
  const obs = [
    { id: 'a', numero: '0.1', reunion_id: null, statut_code: 'memoire', soldee_le: null },
    { id: 'b', numero: '93.2', reunion_id: 'r93', statut_code: 'nouvelle', soldee_le: null },
    { id: 'c', numero: '92.1', reunion_id: 'r92', statut_code: 'soldee', soldee_le: '2025-10-30' },
    { id: 'd', numero: '94.1', reunion_id: 'r94', statut_code: 'nouvelle', soldee_le: null },
    { id: 'e', numero: '93.1', reunion_id: 'r93', statut_code: 'nouvelle', soldee_le: null, supprime_le: '2025-11-01' },
  ]
  it('reprend les points ouverts et masque les soldés avant la réunion', () => {
    expect(observationsDeLaReunion(obs, reunions[2], reunions, statuts).map((o) => o.id)).toEqual(['a', 'b', 'd'])
  })
  it("n'affiche pas une observation créée plus tard", () => {
    expect(observationsDeLaReunion(obs, reunions[1], reunions, statuts).map((o) => o.id)).toEqual(['a', 'b'])
  })
  it('affiche une dernière fois un point soldé pendant la réunion', () => {
    const r = observationsDeLaReunion(obs, reunions[1], reunions, statuts, (o) => o.id === 'c')
    expect(r.map((o) => o.id)).toEqual(['a', 'c', 'b'])
  })
})

describe('présences', () => {
  it('fait tourner les états', () => {
    expect(etatSuivant(null)).toBe('P')
    expect(etatSuivant('N')).toBe(null)
  })
  it('cumule les absences non excusées jusqu’à la réunion', () => {
    const p = [
      { reunion_id: 'r92', intervenant_id: 'x', etat: 'N' },
      { reunion_id: 'r93', intervenant_id: 'x', etat: 'E' },
      { reunion_id: 'r94', intervenant_id: 'x', etat: 'N' },
      { reunion_id: 'r94', intervenant_id: 'y', etat: 'N' },
    ]
    expect(cumulAbsences(p, 'x', reunions, 93)).toBe(1)
    expect(cumulAbsences(p, 'x', reunions, 94)).toBe(2)
    expect(penaliteAbsences(2, 200)).toBe(400)
  })
})

describe('échéances', () => {
  it('signale un retard seulement si non soldé', () => {
    expect(enRetard('2025-11-01', false, '2025-11-06')).toBe(true)
    expect(enRetard('2025-11-01', true, '2025-11-06')).toBe(false)
    expect(enRetard(null, false, '2025-11-06')).toBe(false)
  })
})
