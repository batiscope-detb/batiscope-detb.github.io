import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import JSZip from 'jszip'
import { remplirDocx, remplirXml, normaliser } from '../visibat/reception/remplir'
import { specExe, echeances, ajouterJours, type Identite, type Reserve, type CodeExe } from '../visibat/reception/exe'

const id: Identite = {
  titulaire: { raison: 'SARL Menuiseries du Cotentin', adresse1: '12 rue des Artisans', adresse2: '50100 Cherbourg-en-Cotentin', tel: '02 33 00 00 00', mail: 'contact@menuiseries.fr', siret: '123 456 789 00012' },
  direction: { nom: 'Direction Études et Travaux Bâtiments', pole: 'Pôle Patrimoine et Cadre de Vie', adresse: '10 place Napoléon', codePostal: '50100' },
  agent: { nom: 'Emmanuel DUVAL', tel: '02 33 87 00 00', mail: 'e.duval@cherbourg.fr' }, moe: 'Emmanuel DUVAL',
  objet: 'Mise en conformité SSI de la mairie déléguée', lieu: '50100 Cherbourg-Octeville', lot: 'Lot 02 – Menuiseries intérieures', lotCode: '02', marche: '2026-045',
  prestations: 'Ensemble des prestations du lot 02', partielle: false,
}
const rs: Reserve[] = [
  { id: '1', numero: 'R1', texte: 'Porte CF du local TGBT : ferme-porte à régler', categorie_reserve: 'malfacon', echeance: '2027-03-01', soldee_le: '2027-02-10' },
  { id: '2', numero: 'R2', texte: 'Plinthes du couloir R+1 non posées', categorie_reserve: 'travaux', echeance: '2027-03-01', soldee_le: null },
  { id: '3', numero: 'R3', texte: 'Gravats dans la cour', categorie_reserve: 'lieux', echeance: null, soldee_le: null },
]
const d = { achevement_propose: '2027-01-15', opr_le: '2027-01-29', propositions_le: '2027-02-02', decision_le: '2027-02-20', d_malfacons_avant: '2027-03-31', levee_le: '2027-04-02' }

async function generer(code: CodeExe) {
  const modele = readFileSync(`public/exe/${code}.docx`)
  const r = await remplirDocx(modele, specExe(code, id, d, rs))
  mkdirSync('/tmp/exe-sortie', { recursive: true })
  writeFileSync(`/tmp/exe-sortie/${code}.docx`, Buffer.from(await r.fichier.arrayBuffer()))
  const xml = await (await JSZip.loadAsync(await r.fichier.arrayBuffer())).file('word/document.xml')!.async('string')
  return { ...r, xml }
}

describe('module réception : formulaires EXE', () => {
  it('remplit EXE4 : identités, cases, annexes', async () => {
    const r = await generer('EXE4')
    expect(r.manquantes).toEqual([])
    expect(r.xml).toContain('SARL Menuiseries du Cotentin')
    expect(r.xml).toContain('Marché n° 2026-045')
    expect(r.xml).not.toContain('[Raison sociale entreprise]')
    expect(r.xml).toContain('29/01/2027')
    expect((r.xml.match(/<w:default w:val="1"\/>/g) ?? []).length).toBeGreaterThanOrEqual(8)
    expect(r.xml).toContain('Annexe n° 1')
  })
  for (const code of ['EXE3', 'EXE5', 'EXE6', 'EXE7', 'EXE8', 'EXE9'] as CodeExe[]) {
    it(`toutes les ancres de ${code} sont retrouvées`, async () => {
      const r = await generer(code)
      expect(r.manquantes).toEqual([])
      expect(r.xml).not.toMatch(/\[(Raison sociale entreprise|Objet du marché|N° du marché)\]/)
    })
  }
  it('conserve la mise en forme quand un texte est réparti sur plusieurs morceaux', () => {
    const xml = '<w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>[Raison</w:t></w:r><w:r><w:t> sociale entreprise]</w:t></w:r><w:r><w:t> fin</w:t></w:r></w:p><w:sectPr/></w:body>'
    const r = remplirXml(xml, { champs: { 'Raison sociale entreprise': 'ACME & Fils' } })
    expect(r.xml).toContain('<w:b/></w:rPr><w:t xml:space="preserve">ACME &amp; Fils</w:t>')
    expect(r.xml).toContain('> fin</w:t>')
  })
  it('accepte les modifications suivies du modèle', () => {
    const xml = '<w:body><w:p><w:ins w:id="1" w:author="x"><w:r><w:t>gardé</w:t></w:r></w:ins><w:del w:id="2" w:author="x"><w:r><w:delText>retiré</w:delText></w:r></w:del></w:p><w:sectPr/></w:body>'
    const r = remplirXml(xml, {})
    expect(r.xml).toContain('gardé'); expect(r.xml).not.toContain('retiré'); expect(r.xml).not.toContain('w:ins')
  })
  it('calcule les délais du CCAG (prolongés au jour ouvrable suivant)', () => {
    expect(ajouterJours('2027-01-01', 1)).toBe('2027-01-04') // samedi 2 → lundi 4
    const e = echeances({ achevement_propose: '2027-01-15' }, [])
    expect(e[0].date).toBe('2027-02-04')
    expect(normaliser('L’ouvrage  ')).toBe("l'ouvrage")
  })
})
