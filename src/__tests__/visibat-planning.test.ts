import { describe, expect, it } from 'vitest'
import { analyserPredecesseurs, calculer, formaterPredecesseurs, indenter, joursFeries, normaliser, nouveauPlanning, versISO, type Planning } from '../visibat/planning/moteur'

const base = (): Planning => normaliser({
  projet: { nom: 'Test', debut: '2025-11-03', feries: true, fermetures: [] },
  lots: [{ id: 'l1', code: '02', nom: 'Gros œuvre', entreprise: '', couleur: '#90a4ae' }],
  taches: [
    { id: 'a', nom: 'Installation', duree: 5, preds: [] },
    { id: 'b', nom: 'Démolition', duree: 3, preds: [{ id: 'a', type: 'FD', decalage: 0 }] },
    { id: 'c', nom: 'Nettoyage', duree: 1, preds: [{ id: 'a', type: 'FD', decalage: 0 }] },
  ],
}, nouveauPlanning('x', '2025-11-03', []))

describe('planning (moteur Planibat)', () => {
  it('connaît les jours fériés mobiles', () => {
    expect(joursFeries(2026).has('2026-04-06')).toBe(true) // lundi de Pâques
    expect(joursFeries(2026).has('2026-05-14')).toBe(true) // Ascension
  })
  it('lit et réécrit les prédécesseurs', () => {
    expect(analyserPredecesseurs('3, 5DD+2, 7FF-1').liens).toEqual([{ num: 3, type: 'FD', decalage: 0 }, { num: 5, type: 'DD', decalage: 2 }, { num: 7, type: 'FF', decalage: -1 }])
    expect(analyserPredecesseurs('x').erreurs).toEqual(['x'])
    expect(formaterPredecesseurs([{ id: 'b', type: 'DD', decalage: 2 }], new Map([['b', 4]]))).toBe('4DD+2')
  })
  it('calcule les dates en jours ouvrés (11 novembre férié) et le chemin critique', () => {
    const r = calculer(base())
    const b = r.taches.get('b')!, c = r.taches.get('c')!
    // a : lun 3 → ven 7 ; b : lun 10, (mar 11 férié), mer 12, jeu 13
    expect(versISO(b.debut)).toBe('2025-11-10')
    expect(versISO(b.fin)).toBe('2025-11-13')
    expect(b.critique).toBe(true)
    expect(c.critique).toBe(false)
    expect(c.marge).toBe(2)
  })
  it('gère les tâches récapitulatives', () => {
    const p = base()
    p.taches.push({ id: 'p', parentId: null, lotId: null, zoneId: null, nom: 'Second œuvre', duree: 0, preds: [], debutImpose: null, notes: '' },
      { id: 'd', parentId: null, lotId: null, zoneId: null, nom: 'Cloisons', duree: 2, preds: [{ id: 'b', type: 'FD', decalage: 0 }], debutImpose: null, notes: '' })
    expect(indenter(p.taches, 'd')).toBe(true) // d devient sous-tâche de p
    const r = calculer(p)
    const recap = r.taches.get('p')!, d = r.taches.get('d')!
    expect(recap.recap).toBe(true)
    expect(versISO(recap.debut)).toBe(versISO(d.debut))
    expect(versISO(recap.fin)).toBe(versISO(d.fin))
    expect(r.boucles.length).toBe(0)
  })
})
