/**
 * Export Word (.docx) d'un rapport affiché : la page imprimable est convertie élément par élément
 * (titres, paragraphes, tableaux, listes, photos et plans) pour être retouchée dans Word avant envoi.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageBreak, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType, type IRunOptions, type ParagraphChild,
} from 'docx'

type Bloc = Paragraph | Table
interface Style { gras?: boolean; italique?: boolean; petit?: boolean; couleur?: string }

const LARGEUR_MAX = 640 // px (≈ 17 cm utiles en A4 avec marges de 2 cm)
const BORDURE = { style: BorderStyle.SINGLE, size: 4, color: 'B9B6CF' }
const bordures = { top: BORDURE, bottom: BORDURE, left: BORDURE, right: BORDURE }

async function image(img: HTMLImageElement, largeurMax = LARGEUR_MAX): Promise<ImageRun | null> {
  try {
    const rep = await fetch(img.currentSrc || img.src)
    const blob = await rep.blob()
    const type = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('bmp') ? 'bmp' : 'jpg'
    const nw = img.naturalWidth || 800, nh = img.naturalHeight || 600
    const affiche = img.getBoundingClientRect().width || nw
    const w = Math.min(largeurMax, affiche, nw * 2)
    return new ImageRun({ type, data: await blob.arrayBuffer(), transformation: { width: Math.round(w), height: Math.round((w * nh) / nw) } })
  } catch {
    return null
  }
}

const masque = (el: Element) => el.matches('button, script, style, .pas-word, [hidden]') || getComputedStyle(el).display === 'none'

/** Contenu en ligne d'un élément : texte mis en forme, sauts de ligne, images. */
const enLigne = (el: Node, s: Style, largeurMax: number) => enLigneListe(Array.from(el.childNodes), s, largeurMax)

async function enLigneListe(noeuds: Node[], s: Style, largeurMax: number): Promise<ParagraphChild[]> {
  const res: ParagraphChild[] = []
  for (const n of noeuds) {
    if (n.nodeType === Node.TEXT_NODE) {
      const parent = n.parentElement
      const pre = parent ? /^pre/.test(getComputedStyle(parent).whiteSpace) : false
      const run = (text: string, saut: boolean) => new TextRun({ text, break: saut ? 1 : undefined, bold: s.gras, italics: s.italique, size: s.petit ? 16 : undefined, color: s.couleur } as IRunOptions)
      if (pre) {
        ;(n.textContent ?? '').split('\n').forEach((ligne, i) => res.push(run(ligne.replace(/[ \t]+/g, ' '), i > 0)))
      } else {
        const t = (n.textContent ?? '').replace(/\s+/g, ' ')
        if (t.trim() || (t === ' ' && res.length)) res.push(run(t, false))
      }
      continue
    }
    if (!(n instanceof HTMLElement) || masque(n)) continue
    const tag = n.tagName
    // Élément affiché en bloc au milieu d'un contenu en ligne : passage à la ligne.
    const enBloc = tag !== 'BR' && /^(block|flex|grid|list-item|table)/.test(getComputedStyle(n).display)
    if (res.length && enBloc) res.push(new TextRun({ text: '', break: 1 }))
    if (tag === 'BR') { res.push(new TextRun({ text: '', break: 1 })); continue }
    if (tag === 'IMG') { const im = await image(n as HTMLImageElement, largeurMax); if (im) res.push(im); continue }
    const fils: Style = {
      ...s,
      gras: s.gras || ['B', 'STRONG', 'TH'].includes(tag) || n.classList.contains('etq'),
      italique: s.italique || ['I', 'EM'].includes(tag),
      petit: s.petit || tag === 'SMALL',
    }
    res.push(...(await enLigne(n, fils, largeurMax)))
    if (enBloc) res.push(new TextRun({ text: ' ', bold: s.gras }))
  }
  return res
}

const estBloc = (el: Element) => /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|H[1-6]|TABLE|UL|OL|FIGURE|BLOCKQUOTE|DETAILS)$/.test(el.tagName)

async function tableau(t: HTMLTableElement): Promise<Table> {
  const lignes: TableRow[] = []
  const nbCol = Math.max(1, ...Array.from(t.rows).map((r) => Array.from(r.cells).reduce((n, c) => n + (c.colSpan || 1), 0)))
  for (const r of Array.from(t.rows)) {
    if (masque(r)) continue
    const entete = r.parentElement?.tagName === 'THEAD' || Array.from(r.cells).every((c) => c.tagName === 'TH')
    const fond = r.classList.contains('titre-article') ? '2E2A5B' : entete ? 'E6E4F0' : r.classList.contains('sous-titre-notice') ? 'F1F0F7' : undefined
    const cellules: TableCell[] = []
    for (const c of Array.from(r.cells)) {
      const largeur = (LARGEUR_MAX / nbCol) * (c.colSpan || 1)
      const enfants = await blocs(c, { gras: c.tagName === 'TH', couleur: fond === '2E2A5B' ? 'FFFFFF' : undefined }, largeur - 12)
      cellules.push(new TableCell({
        children: enfants.length ? enfants : [new Paragraph('')],
        columnSpan: c.colSpan > 1 ? c.colSpan : undefined,
        shading: fond ? { type: ShadingType.CLEAR, color: 'auto', fill: fond } : undefined,
        borders: bordures,
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
      }))
    }
    if (cellules.length) lignes.push(new TableRow({ children: cellules, tableHeader: entete, cantSplit: true }))
  }
  return new Table({ rows: lignes, width: { size: 100, type: WidthType.PERCENTAGE } })
}

/** Convertit le contenu d'un élément en blocs Word. */
async function blocs(el: Element, s: Style = {}, largeurMax = LARGEUR_MAX): Promise<Bloc[]> {
  const res: Bloc[] = []
  const sauts = new Set<Bloc>()
  const sauter = () => { const d = res[res.length - 1]; if (res.length && d && sauts.has(d)) return; const b = new Paragraph({ children: [new PageBreak()] }); sauts.add(b); res.push(b) }
  let tampon: Node[] = [] // contenu en ligne en attente d'un paragraphe
  const vider = async () => {
    if (!tampon.length) return
    const enfants = await enLigneListe(tampon, s, largeurMax)
    tampon = []
    if (enfants.length) res.push(new Paragraph({ children: enfants, spacing: { after: 80 } }))
  }
  for (const n of Array.from(el.childNodes)) {
    if (n instanceof HTMLElement && masque(n)) continue
    if (!(n instanceof HTMLElement) || !estBloc(n)) {
      if (n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim() && !tampon.length) continue
      tampon.push(n); continue
    }
    await vider()
    const tag = n.tagName
    if (n.classList.contains('saut')) sauter()
    if (/^H[1-4]$/.test(tag)) {
      const niveau = { H1: HeadingLevel.TITLE, H2: HeadingLevel.HEADING_1, H3: HeadingLevel.HEADING_2, H4: HeadingLevel.HEADING_3 }[tag as 'H1']
      res.push(new Paragraph({ heading: niveau, children: await enLigne(n, s, largeurMax), keepNext: true }))
    } else if (tag === 'P') {
      const enfants = await enLigne(n, { ...s, italique: s.italique || n.classList.contains('remarque') }, largeurMax)
      if (enfants.length) res.push(new Paragraph({ children: enfants, spacing: { after: 100 }, alignment: n.classList.contains('signature') ? AlignmentType.RIGHT : undefined }))
    } else if (tag === 'TABLE') {
      res.push(await tableau(n as HTMLTableElement), new Paragraph({ text: '', spacing: { after: 60 } }))
    } else if (tag === 'UL' || tag === 'OL') {
      let k = 0
      for (const li of Array.from(n.children)) {
        k++
        const enfants = await enLigne(li, s, largeurMax)
        res.push(tag === 'UL'
          ? new Paragraph({ children: enfants, bullet: { level: 0 }, spacing: { after: 40 } })
          : new Paragraph({ children: [new TextRun(`${k}. `), ...enfants], spacing: { after: 40 } }))
      }
    } else {
      res.push(...(await blocs(n, s, largeurMax)))
    }
    if (n.classList.contains('couverture')) sauter()
  }
  await vider()
  return res
}

/** Construit le .docx à partir de l'élément affiché et le télécharge. */
export async function exporterWord(racine: HTMLElement, nomFichier: string, titre: string) {
  const contenu = await blocs(racine)
  const doc = new Document({
    title: titre,
    creator: 'Direction Études et Travaux Bâtiments — Ville de Cherbourg-en-Cotentin',
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 40, bold: true, color: '2E2A5B' }, paragraph: { spacing: { after: 200 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { size: 28, bold: true, color: '2E2A5B' }, paragraph: { spacing: { before: 240, after: 120 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { size: 23, bold: true, color: '2E2A5B' }, paragraph: { spacing: { before: 180, after: 80 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', run: { size: 21, bold: true }, paragraph: { spacing: { before: 120, after: 60 } } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: `${titre} — Direction Études et Travaux Bâtiments — page `, size: 16, color: '6B6890' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '6B6890' }),
          new TextRun({ text: ' / ', size: 16, color: '6B6890' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '6B6890' }),
        ] })] }),
      },
      children: contenu,
    }],
  })
  const blob = await Packer.toBlob(doc)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nomFichier.replace(/[\\/:*?"<>|]/g, '-') + '.docx'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}
