import { describe, expect, it } from 'vitest'
import { construireEml } from '../visibat/diffusion'
import { completer, observationsExport, parEntreprise, regrouper } from '../visibat/export/reglages'
import type { Contact, Dossier, Statut } from '../visibat/donnees'

const statuts = [
  { id: '1', code: 'memoire', libelle: 'Pour mémoire', couleur: '#2e7d4f', ordre: 1, reporte: true, soldant: false, date_demandee: 'aucune' },
  { id: '2', code: 'nouvelle', libelle: 'Nouvelle', couleur: '#1d5fa8', ordre: 2, reporte: true, soldant: false, date_demandee: 'echeance' },
  { id: '7', code: 'soldee', libelle: 'Soldée', couleur: '#5f6b76', ordre: 7, reporte: false, soldant: true, date_demandee: 'constat' },
] as Statut[]
const contacts = [
  { id: 'c1', nom: 'Sauvage', prenom: 'C.', societe: 'Leduc SAS', email: 'a@leduc.fr', type_intervenant: 'entreprise' },
  { id: 'c2', nom: 'Cornic', prenom: 'D.', societe: 'Menuiserie Cornic', email: 'b@cornic.fr', type_intervenant: 'entreprise' },
] as Contact[]
const obs = (id: string, numero: string, reunion_id: string | null, statut_code: string, rubrique: 'lot' | 'generale' = 'lot') =>
  ({ id, operation_id: 'o', reunion_id, numero, rubrique, texte: id, statut_code, date_statut: null, echeance: null, date_intervention: null, a_charge_de: null, soldee_le: statut_code === 'soldee' ? '2025-11-06' : null, ordre: 0 })
const dossier = {
  operation: { id: 'o' },
  lots: [{ id: 'l8', operation_id: 'o', code: '08', libelle: 'Couverture', couleur: null, marche: null, ordre: 0 }, { id: 'l4', operation_id: 'o', code: '04', libelle: 'Menuiserie', couleur: null, marche: null, ordre: 1 }],
  intervenants: [
    { id: 'i1', operation_id: 'o', contact_id: 'c1', categorie: 'entreprise', lot_id: 'l8', diffusion: true, convoque_defaut: true, ordre: 0 },
    { id: 'i2', operation_id: 'o', contact_id: 'c2', categorie: 'entreprise', lot_id: 'l4', diffusion: true, convoque_defaut: true, ordre: 1 },
  ],
  reunions: [{ id: 'r93', numero: 93, date_reunion: '2025-10-30T09:00:00Z' }, { id: 'r94', numero: 94, date_reunion: '2025-11-06T09:00:00Z' }],
  presences: [],
  observations: [obs('g', '0.1', null, 'memoire', 'generale'), obs('a', '93.1', 'r93', 'nouvelle'), obs('b', '94.1', 'r94', 'nouvelle'), obs('s', '94.2', 'r94', 'soldee')],
  obsLots: [{ id: 'x', observation_id: 'a', lot_id: 'l8' }, { id: 'y', observation_id: 'b', lot_id: 'l4' }, { id: 'z', observation_id: 's', lot_id: 'l4' }],
  obsIntervenants: [], suivis: [{ id: 'su', observation_id: 's', reunion_id: 'r94', statut_code: 'soldee', complement: null }],
  checklists: [], commentaires: [], plans: [], positions: [], photos: [], annotations: [],
} as unknown as Dossier
const r94 = dossier.reunions[1]

describe('export du CR', () => {
  it('filtre les remarques selon le modèle', () => {
    const ids = (o: { id: string }[]) => o.map((x) => x.id).sort()
    expect(ids(observationsExport(dossier, r94, statuts, completer({})))).toEqual(['a', 'b', 'g', 's'])
    expect(ids(observationsExport(dossier, r94, statuts, completer({ remarques: 'courante' })))).toEqual(['b', 's'])
    expect(ids(observationsExport(dossier, r94, statuts, completer({ remarques: 'ouvertes' })))).toEqual(['a', 'b'])
    expect(ids(observationsExport(dossier, r94, statuts, completer({ memoire: false })))).toEqual(['a', 'b', 's'])
  })
  it('classe par lot ou par statut', () => {
    const o = observationsExport(dossier, r94, statuts, completer({}))
    expect(regrouper(dossier, o, contacts, statuts, completer({ classement: 'lot' })).map((g) => g.titre)).toEqual(['Remarques générales', '08 Couverture', '04 Menuiserie'])
    expect(regrouper(dossier, o, contacts, statuts, completer({ classement: 'statut' })).map((g) => g.observations.length)).toEqual([1, 2, 1])
  })
  it('prépare un extrait par entreprise avec ses remarques et les remarques générales', () => {
    const o = observationsExport(dossier, r94, statuts, completer({}))
    const e = parEntreprise(dossier, o, contacts)
    expect(e.map((x) => x.nom)).toEqual(['Leduc SAS', 'Menuiserie Cornic'])
    expect(e[0].observations.map((x) => x.id).sort()).toEqual(['a', 'g'])
    expect(e[1].emails).toEqual(['b@cornic.fr'])
  })
  it('construit un brouillon Outlook avec le PDF joint', () => {
    const eml = construireEml(['a@b.fr', 'c@d.fr'], 'CR n° 94', 'Bonjour', [{ nom: 'CR 94.pdf', contenu: new Uint8Array([37, 80, 68, 70]), type: 'application/pdf' }])
    expect(eml).toContain('X-Unsent: 1')
    expect(eml).toContain('Bcc: a@b.fr, c@d.fr')
    expect(eml).toMatch(/Content-Type: multipart\/mixed; boundary="(.+)"/)
    expect(eml).toContain('Content-Disposition: attachment')
    expect(eml).toContain('JVBERg==') // « %PDF » en base64
  })
})

describe('ordre dans une rubrique', () => {
  it('garde les points « pour mémoire » en tête du lot', async () => {
    const { trierRubrique } = await import('../visibat/organisation')
    const o = [obs('b', '94.1', 'r94', 'nouvelle'), obs('m', '0.18', null, 'memoire'), obs('a', '93.1', 'r93', 'nouvelle'), obs('n', '75.1', 'r93', 'memoire')]
    expect(trierRubrique(o).map((x) => x.numero)).toEqual(['0.18', '75.1', '93.1', '94.1'])
  })
})

describe('couleurs des documents', () => {
  it('passe les statuts en gris en noir et blanc et garde les couleurs sinon', async () => {
    const { couleurDoc } = await import('../visibat/export/reglages')
    expect(couleurDoc('#b3261e', { palette: 'prune' })).toBe('#b3261e')
    expect(couleurDoc('#b3261e', { palette: 'nb' })).toMatch(/^#([0-9a-f]{2})\1\1$/)
    expect(completer({ palette: 'inconnue' }).palette).toBe('prune')
  })
})
