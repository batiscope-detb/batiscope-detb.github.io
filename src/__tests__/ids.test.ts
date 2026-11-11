import { describe, expect, it } from 'vitest'
import { idStable } from '../ids'
import { fusionner } from '../donnees'

describe('identifiants partagés avec la tablette', () => {
  it('idStable = UUID.nameUUIDFromBytes (valeurs relevées en base)', () => {
    expect(idStable('detb:lot:menuiseries intérieures')).toBe('4a83c67b-3d85-3352-9a72-af4b0e904ec2')
    expect(idStable('detb:lot:revêtements de sols')).toBe('462c7511-632f-3b06-8f04-2eccd3e768b6')
    expect(idStable('detb:lot:vrd / espaces extérieurs')).toBe('03ee154f-bbfa-342b-8ed6-f6778bceeb0b')
  })
})

describe('fusion en mémoire', () => {
  it('remplace, ajoute et retire les lignes supprimées', () => {
    const l = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]
    expect(fusionner(l, { id: 'a', v: 3 }, (x) => x.id)).toEqual([{ id: 'b', v: 2 }, { id: 'a', v: 3 }])
    expect(fusionner(l, { id: 'c', v: 4 }, (x) => x.id)).toHaveLength(3)
    expect(fusionner(l, { id: 'a', supprime_le: '2026-11-11' }, (x) => x.id)).toEqual([{ id: 'b', v: 2 }])
  })
})

describe('diagnostic', () => {
  it('même identifiant que la tablette (test MoteurAccessibiliteTest côté Android)', async () => {
    const { idDiagnostic } = await import('../ids')
    expect(idDiagnostic('261e2c9b-a72e-49cb-82c1-8317e27f58fc')).toBe('c1b9ecb3-c505-3f2e-a95a-8653a9463f08')
  })
})
