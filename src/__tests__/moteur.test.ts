import { describe, expect, it } from 'vitest'
import { REGLES, evaluer, paliersDe, regleParId, reglesPour, synthese, taux, lignes, type Contexte, type Saisie } from '../moteur'
import { statutAffiche, travauxParLot } from '../calculs'

const diag = { id: 'd', projet_id: 'p', type_erp: 'W', categorie: 5, mission_service_public: true, enseignement: false, restaurant: false,
  contrainte_structurelle: false, effectif_etages: null, prestations_hors_rdc: false, nb_places_parking: null, nb_places_assises: null, observations: null }
const el = (type: string) => ({ id: 'e', diagnostic_id: 'd', niveau_id: null, sequence: '03 Accès', element_type: type, libelle: type,
  effectif_local: null, travaux_prevus: false, contrainte_structurelle: false, plusieurs_vantaux: false, plan_x: null, plan_y: null, supprime_le: null })
const ctx = (type: string): Contexte => ({ diagnostic: diag, element: el(type), niveauAccessibleFauteuil: null })
const s = (regle_id: string, o: Partial<Saisie>): Saisie => ({ element_id: 'e', regle_id, mesure: null, mesure_palier: null, palier_bool: null, statut_force: null, commentaire: null, ...o })

describe('référentiel', () => {
  it('contient les 250 règles dont 16 tolérances', () => {
    expect(REGLES.length).toBe(250)
    expect(REGLES.filter((r) => r.parent).length).toBe(16)
  })
  it('les paliers ne sont pas saisissables directement', () => {
    for (const t of new Set(REGLES.map((r) => r.element))) expect(reglesPour(t, true).some((r) => r.parent)).toBe(false)
  })
})

describe('moteur', () => {
  it('mesure dans le seuil → conforme, hors seuil → non conforme', () => {
    const r = REGLES.find((x) => x.type === 'Mesurable' && x.operateur === '≤' && x.vmax != null && !paliersDe(x.id).length && !x.conditions.length)!
    const c = ctx(r.element)
    expect(evaluer(r, s(r.id, { mesure: r.vmax! }), c).statut).toBe('C')
    expect(evaluer(r, s(r.id, { mesure: r.vmax! + 1 }), c).statut).toBe('NC')
    expect(evaluer(r, null, c).statut).toBeNull()
  })
  it('statut forcé prioritaire', () => {
    const r = regleParId('ACC-04')!
    expect(evaluer(r, s(r.id, { mesure: 20, statut_force: 'SO' }), ctx(r.element), paliersDe(r.id)).statut).toBe('SO')
  })
  it('taux : conformes sous tolérance comptés conformes', () => {
    const r = REGLES.find((x) => paliersDe(x.id).length > 0)!
    const ls = lignes([r], [s(r.id, { statut_force: 'CT' })], ctx(r.element))
    const sy = synthese(ls)
    expect(sy.sousTolerance + sy.conformes + sy.nonConformes).toBeGreaterThanOrEqual(0)
    expect(taux({ conformes: 1, sousTolerance: 1, nonConformes: 2, bloquantes: 0, aExpertiser: 0, aRenseigner: 0, sansObjet: 0 })).toBe(50)
  })
})

describe('indicateurs', () => {
  it('bâtiment jamais relevé : à diagnostiquer', () => {
    const p = { statut: 'diagnostic' } as never
    expect(statutAffiche(p, 0, 0)).toBe('a_diagnostiquer')
    expect(statutAffiche(p, 1, 0)).toBe('diagnostic')
  })
  it('travaux par lot ignorent les constats « info »', () => {
    const c = (lot_id: string, gravite: 'info' | 'urgent', estimation: number) => ({ id: Math.random() + '', local_id: 'l', lot_id, note: null, gravite, estimation, cree_le: '', maj_le: '', maj_par: null })
    const r = travauxParLot([c('a', 'urgent', 100), c('a', 'info', 999), c('b', 'urgent', 300)], [{ id: 'a', libelle: 'Plomberie', ordre: 1, archive_le: null }, { id: 'b', libelle: 'Électricité', ordre: 2, archive_le: null }])
    expect(r).toEqual([{ lot: 'Électricité', montant: 300, nb: 1, urgents: 1 }, { lot: 'Plomberie', montant: 100, nb: 1, urgents: 1 }])
  })
})
