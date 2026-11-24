import { describe, expect, it } from 'vitest'
import { superposer, estReseau, type Entree } from '../visibat/horsligne'
import { finaliserDossier, type Dossier } from '../visibat/donnees'

const le = '2026-11-23T10:00:00Z'
const vide = (): Dossier => ({
  operation: { id: 'op', nom: 'Op', objet: null, adresse: null, projet_id: null, proprietaire_id: null, groupe_id: null, debut_travaux: null, objectif_reception: null, photo_path: null, penalite_absence: null, clause_diffusion: null, planning_actif: false, planning: null, archive: false, direction_id: null },
  lots: [], intervenants: [], reunions: [{ id: 'r1', operation_id: 'op', numero: 1, date_reunion: le, lieu: null, prochaine_date: null, prochaine_lieu: null, statut: 'brouillon', diffusee_le: null }],
  presences: [], observations: [], obsLots: [], obsIntervenants: [], suivis: [], checklists: [], commentaires: [], plans: [], positions: [], photos: [], annotations: [], receptions: [], reserves: [],
})

describe('saisie hors ligne : superposition des écritures en attente', () => {
  it('ajoute, modifie puis supprime dans l’ordre de la file', () => {
    const file: Entree[] = [
      { genre: 'enregistrer', le, table: 'contact', id: 'c2', ligne: { id: 'c2', nom: 'B' } },
      { genre: 'modifier', le, table: 'contact', id: 'c1', ligne: { nom: 'A modifié' } },
      { genre: 'supprimer', le, table: 'contact', id: 'c3', ligne: { supprime_le: le } },
    ]
    const r = superposer(file, 'contact', [{ id: 'c1', nom: 'A' }, { id: 'c3', nom: 'C' }])
    expect(r.map((x) => [x.id, (x as { nom: string }).nom])).toEqual([['c1', 'A modifié'], ['c2', 'B']])
  })
  it('n’ajoute que les lignes de l’opération et leurs dépendances', () => {
    const file: Entree[] = [
      { genre: 'enregistrer', le, table: 'observation', id: 'o1', ligne: { id: 'o1', operation_id: 'op', numero: '1.1', texte: 'Fissure', ordre: 0 } },
      { genre: 'enregistrer', le, table: 'observation', id: 'oX', ligne: { id: 'oX', operation_id: 'autre', numero: '1.1', texte: 'Ailleurs', ordre: 0 } },
      { genre: 'enregistrer', le, table: 'observation_photo', id: 'p1', ligne: { id: 'p1', observation_id: 'o1', storage_path: 'x.jpg', ordre: 0 } },
      { genre: 'enregistrer', le, table: 'observation_photo', id: 'pX', ligne: { id: 'pX', observation_id: 'oX', storage_path: 'y.jpg', ordre: 0 } },
      { genre: 'enregistrer', le, table: 'presence', id: 'pr', ligne: { id: 'pr', reunion_id: 'r1', intervenant_id: 'i', etat: 'P', convoque: true } },
      { genre: 'modifier', le, table: 'operation', id: 'op', ligne: { nom: 'Op renommée' } },
    ]
    const d = finaliserDossier(vide(), file)
    expect(d.observations.map((o) => o.id)).toEqual(['o1'])
    expect(d.photos.map((p) => p.id)).toEqual(['p1'])
    expect(d.presences).toHaveLength(1)
    expect(d.operation.nom).toBe('Op renommée')
  })
  it('reconnaît une coupure réseau', () => {
    expect(estReseau(new Error('TypeError: Failed to fetch'))).toBe(true)
    expect(estReseau(new Error('new row violates row-level security policy'))).toBe(false)
  })
})
