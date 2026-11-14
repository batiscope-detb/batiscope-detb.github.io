/** Export Excel du patrimoine (chargé à la demande pour alléger l'appli). */
import ExcelJS from 'exceljs'
import type { IndicateursErp } from './calculs'
import { travauxParLot } from './calculs'
import { LIBELLE_GRAVITE, LIBELLE_STATUT_ERP, type Patrimoine } from './donnees'

const VIOLET = 'FF2E2B57'

function entete(ws: ExcelJS.Worksheet, colonnes: { titre: string; largeur: number; format?: string }[]) {
  ws.columns = colonnes.map((c) => ({ header: c.titre, width: c.largeur, style: c.format ? { numFmt: c.format } : {} }))
  const r = ws.getRow(1)
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VIOLET } }
  r.alignment = { vertical: 'middle', wrapText: true }
  r.height = 30
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonnes.length } }
}

export async function exporterPatrimoine(ind: IndicateursErp[], p: Patrimoine) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Batiscope — DETB'
  wb.created = new Date()
  const EUR = '#,##0 "€"'

  const ws1 = wb.addWorksheet('Bâtiments')
  entete(ws1, [
    { titre: 'Bâtiment', largeur: 34 }, { titre: 'Code', largeur: 12 }, { titre: 'Adresse', largeur: 34 }, { titre: 'Commune déléguée', largeur: 22 },
    { titre: 'Type ERP', largeur: 9 }, { titre: 'Catégorie', largeur: 9 }, { titre: 'Avancement', largeur: 20 }, { titre: 'Niveaux', largeur: 8 },
    { titre: 'Locaux', largeur: 8 }, { titre: 'Constats', largeur: 9 }, { titre: 'Urgents', largeur: 9 }, { titre: 'Estimation HT', largeur: 14, format: EUR },
    { titre: 'Conformité accessibilité', largeur: 13, format: '0" %"' }, { titre: 'Non-conformités', largeur: 13 }, { titre: 'dont bloquantes', largeur: 12 },
    { titre: 'Dérogations en cours', largeur: 12 }, { titre: 'Mis à jour', largeur: 12, format: 'dd/mm/yyyy' },
  ])
  for (const i of ind) ws1.addRow([
    i.projet.nom, i.projet.code, i.projet.adresse, i.projet.commune_deleguee, i.diagnostic?.type_erp ?? null, i.diagnostic?.categorie ?? null,
    LIBELLE_STATUT_ERP[i.statut], i.nbNiveaux, i.nbLocaux, i.nbConstats, i.nbUrgents, i.estimation || null, i.taux,
    i.diagnostic ? i.acc.nonConformes : null, i.diagnostic ? i.acc.bloquantes : null, i.derogationsEnCours || null, new Date(i.derniereMaj),
  ])

  const ids = new Set(ind.map((i) => i.projet.id))
  const local = new Map(p.locaux.map((l) => [l.id, l]))
  const projet = new Map(p.projets.map((x) => [x.id, x.nom]))
  const niveau = new Map(p.niveaux.map((n) => [n.id, n.libelle]))
  const lot = new Map(p.lots.map((l) => [l.id, l.libelle]))
  const constats = p.constats.filter((c) => ids.has(local.get(c.local_id)?.projet_id ?? ''))

  const ws2 = wb.addWorksheet('Constats')
  entete(ws2, [
    { titre: 'Bâtiment', largeur: 30 }, { titre: 'Niveau', largeur: 14 }, { titre: 'Local', largeur: 24 }, { titre: "Corps d'état", largeur: 24 },
    { titre: 'Gravité', largeur: 11 }, { titre: 'Estimation HT', largeur: 14, format: EUR }, { titre: 'Observation', largeur: 60 }, { titre: 'Relevé le', largeur: 12, format: 'dd/mm/yyyy' },
  ])
  for (const c of constats) {
    const l = local.get(c.local_id)
    const r = ws2.addRow([projet.get(l?.projet_id ?? ''), l?.niveau_id ? niveau.get(l.niveau_id) : null, l?.libelle, c.lot_id ? lot.get(c.lot_id) : null,
      c.gravite ? LIBELLE_GRAVITE[c.gravite] : null, c.estimation != null ? Number(c.estimation) : null, c.note, new Date(c.cree_le)])
    r.getCell(7).alignment = { wrapText: true, vertical: 'top' }
  }

  const ws3 = wb.addWorksheet("Par corps d'état")
  entete(ws3, [{ titre: "Corps d'état", largeur: 34 }, { titre: 'Constats', largeur: 10 }, { titre: 'Urgents', largeur: 10 }, { titre: 'Estimation HT', largeur: 16, format: EUR }])
  const lots = travauxParLot(constats, p.lots)
  for (const l of lots) ws3.addRow([l.lot, l.nb, l.urgents, l.montant || null])
  const tot = ws3.addRow(['Total', { formula: `SUM(B2:B${lots.length + 1})` }, { formula: `SUM(C2:C${lots.length + 1})` }, { formula: `SUM(D2:D${lots.length + 1})` }])
  tot.font = { bold: true }

  const ws4 = wb.addWorksheet('Accessibilité')
  entete(ws4, [
    { titre: 'Bâtiment', largeur: 30 }, { titre: 'Élément', largeur: 26 }, { titre: 'Type', largeur: 20 }, { titre: 'Règle', largeur: 10 },
    { titre: 'Point de contrôle', largeur: 50 }, { titre: 'Gravité', largeur: 10 }, { titre: 'Mesure', largeur: 9 }, { titre: 'Statut', largeur: 22 }, { titre: 'Commentaire', largeur: 40 },
  ])
  const STATUTS: Record<string, string> = { C: 'Conforme', CT: 'Conforme sous tolérance', NC: 'Non conforme', AE: 'À expertiser', NV: 'Non vérifiable', SO: 'Sans objet' }
  for (const i of ind) for (const e of i.elements) for (const l of e.lignes) {
    if (l.statut == null) continue
    ws4.addRow([i.projet.nom, e.element.libelle, e.element.element_type, l.regle.id, l.regle.point, l.regle.gravite,
      l.saisie?.mesure != null ? Number(l.saisie.mesure) : null, STATUTS[l.statut], l.saisie?.commentaire ?? null])
  }

  const tampon = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `Patrimoine_DETB_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
