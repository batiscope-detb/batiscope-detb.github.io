/**
 * Remplissage des formulaires Word de la DAJ (EXE3 à EXE9) sans altérer leur mise en page.
 * Le document est traité paragraphe par paragraphe ; les règles désignent un paragraphe par le début de son texte
 * (« ancre »), éventuellement par son rang quand le même texte revient plusieurs fois.
 * - cases : coche les cases à cocher Word (champ FORMCHECKBOX) ;
 * - pointilles : remplace, dans l'ordre, les zones de pointillés « …… » du paragraphe ;
 * - champs : remplace les zones [entre crochets] ; les consignes « [Indiquer …] » de la DAJ sont retirées ;
 * - ajouts : ajoute du texte à la ligne, à la fin d'un paragraphe (ex. prestations concernées) ;
 * - remplacements : remplace un texte fixe (ex. le pôle de la direction) ;
 * - annexes : ajoutées en fin de document, chacune sur une nouvelle page, avec un tableau.
 */
import JSZip from 'jszip'

export interface Regle { ancre: string; rang?: number }
export interface Spec {
  champs?: Record<string, string>
  cases?: (Regle & { coche: boolean })[]
  pointilles?: (Regle & { valeurs: (string | null | undefined)[] })[]
  ajouts?: (Regle & { texte: string })[]
  remplacements?: [string, string][]
  annexes?: Annexe[]
}
export interface Annexe { titre: string; entetes: string[]; lignes: string[][]; largeurs?: number[] }

const DECODE: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
const decoder = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => DECODE[m])
export const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Texte comparable : apostrophes et espaces unifiés, minuscules, sans case ni tabulation en tête. */
export const normaliser = (s: string) => s.replace(/[’‘`]/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

const RE_PARAGRAPHE = /<w:p[ >][\s\S]*?<\/w:p>/g
const RE_TEXTE = /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g
/** Pointillés à remplir : suites de « … » (avec points éventuels) ou d'au moins 5 points. */
const RE_POINTILLES = /…[…\.]*|\.{5,}/g

interface Morceau { debut: number; fin: number; ouvrant: string; texte: string; fermant: string }
function morceaux(p: string): Morceau[] {
  const res: Morceau[] = []
  for (const m of p.matchAll(RE_TEXTE)) res.push({ debut: m.index!, fin: m.index! + m[0].length, ouvrant: m[1], texte: decoder(m[2]), fermant: m[3] })
  return res
}

/**
 * Applique des remplacements (positions dans le texte concaténé du paragraphe) en conservant la mise en forme :
 * le nouveau texte prend la place du premier morceau touché, les suivants sont raccourcis.
 */
function editer(p: string, edits: { de: number; a: number; texte: string }[]): string {
  if (!edits.length) return p
  const ms = morceaux(p)
  const textes = ms.map((m) => m.texte)
  const bornes: number[] = []
  let acc = 0
  for (const t of textes) { bornes.push(acc); acc += t.length }
  for (const e of [...edits].sort((a, b) => b.de - a.de)) {
    let premier = true
    for (let i = 0; i < textes.length; i++) {
      const d = bornes[i], f = d + ms[i].texte.length
      if (f < e.de || d > e.a || (f === e.de && e.a > e.de) ) continue
      const s = Math.max(e.de, d) - d, z = Math.min(e.a, f) - d
      textes[i] = textes[i].slice(0, s) + (premier ? e.texte : '') + textes[i].slice(z)
      premier = false
      if (e.a <= f) break
    }
  }
  let out = '', pos = 0
  ms.forEach((m, i) => {
    out += p.slice(pos, m.debut)
    const ouvrant = /xml:space/.test(m.ouvrant) ? m.ouvrant : m.ouvrant.replace('<w:t', '<w:t xml:space="preserve"')
    out += ouvrant + echapper(textes[i]) + m.fermant
    pos = m.fin
  })
  return out + p.slice(pos)
}

const texteDe = (p: string) => morceaux(p).map((m) => m.texte).join('')
const cocher = (p: string) => p.replace(/<w:checkBox>([\s\S]*?)<\/w:checkBox>/, (_m, c: string) =>
  `<w:checkBox>${c.replace(/<w:default[^>]*\/>|<w:checked[^>]*\/>/g, '')}<w:default w:val="1"/><w:checked/></w:checkBox>`)
/** Texte ajouté : nouveaux paragraphes (même retrait que l'ancre, sans numérotation ni justification), en Arial. */
function paragraphesApres(p: string, t: string): string {
  const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '').replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '').replace(/<w:jc [^>]*\/>/, '<w:jc w:val="left"/>').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '')
  return t.split('\n').map((l) => `<w:p>${pPr}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">${echapper(l)}</w:t></w:r></w:p>`).join('')
}

/** Annexe : saut de page, titre, tableau à bordures. */
function xmlAnnexe(a: Annexe): string {
  const total = 9638
  const larg = a.largeurs ?? a.entetes.map(() => 1)
  const somme = larg.reduce((s, x) => s + x, 0)
  const cols = larg.map((x) => Math.round((x / somme) * total))
  const cellule = (t: string, w: number, entete: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${entete ? '<w:shd w:val="clear" w:color="auto" w:fill="E6E6E6"/>' : ''}</w:tcPr>` +
    t.split('\n').map((l) => `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${entete ? '<w:b/>' : ''}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${echapper(l)}</w:t></w:r></w:p>`).join('') + '</w:tc>'
  const bord = '<w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/>'
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    `<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${echapper(a.titre)}</w:t></w:r></w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${bord}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>` +
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${a.entetes.map((h, i) => cellule(h, cols[i], true)).join('')}</w:tr>` +
    (a.lignes.length ? a.lignes : [a.entetes.map((_, i) => (i === 0 ? 'Néant' : ''))]).map((l) => `<w:tr>${l.map((c, i) => cellule(c, cols[i], false)).join('')}</w:tr>`).join('') +
    '</w:tbl><w:p/>'
}

export interface Bilan { xml: string; manquantes: string[] }

/** Accepte les modifications suivies du modèle (texte barré / souligné en couleur) : le document généré est propre. */
export function accepterRevisions(xml: string): string {
  return xml
    .replace(/<w:(del|moveFrom)(?:\s[^>]*)?>[\s\S]*?<\/w:\1>/g, '')
    .replace(/<w:(ins|moveTo)(?:\s[^>]*)?>|<\/w:(ins|moveTo)>/g, '')
    .replace(/<w:(rPr|pPr|sectPr|tblPr|tcPr|trPr|tblGrid|tblPrEx)Change\b[\s\S]*?<\/w:\1Change>/g, '')
    .replace(/<w:(del|ins|moveFrom|moveTo)\s[^>]*\/>/g, '')
    .replace(/<w:(moveFromRange|moveToRange)(Start|End)\b[^>]*\/>/g, '')
}

/** Remplit le XML du corps du document (word/document.xml). Rend aussi les ancres introuvables (modèle importé modifié). */
export function remplirXml(xml: string, spec: Spec): Bilan {
  const vues = new Map<string, number>()
  const trouvees = new Set<string>()
  const cle = (r: Regle) => `${normaliser(r.ancre)}#${r.rang ?? 1}`
  const correspond = (r: Regle, t: string, rang: number) => t.startsWith(normaliser(r.ancre)) && (r.rang ?? 1) === rang
  const rangs = (t: string) => {
    // rang de ce paragraphe pour chaque ancre qu'il satisfait
    const res = new Map<string, number>()
    for (const r of [...(spec.cases ?? []), ...(spec.pointilles ?? []), ...(spec.ajouts ?? [])]) {
      const a = normaliser(r.ancre)
      if (!t.startsWith(a) || res.has(a)) continue
      const n = (vues.get(a) ?? 0) + 1
      vues.set(a, n); res.set(a, n)
    }
    return res
  }
  const nouveau = accepterRevisions(xml).replace(RE_PARAGRAPHE, (p) => {
    const brut = texteDe(p)
    const t = normaliser(brut)
    const r = rangs(t)
    const rangDe = (x: Regle) => r.get(normaliser(x.ancre)) ?? -1
    let q = p
    // Cases à cocher
    for (const c of spec.cases ?? []) if (correspond(c, t, rangDe(c))) { trouvees.add(cle(c)); if (c.coche && q.includes('FORMCHECKBOX')) q = cocher(q) }
    // Zones de texte : crochets, pointillés, remplacements fixes
    const edits: { de: number; a: number; texte: string }[] = []
    for (const m of brut.matchAll(/\[([^\]]{1,400})\]/g)) {
      const nom = m[1].trim()
      const v = spec.champs?.[nom] ?? spec.champs?.[normaliser(nom)]
      // « Marché [N° du marché] » : pas de doublon « Marché Marché n° … »
      const avant = brut.slice(Math.max(0, m.index! - 12), m.index!)
      if (v !== undefined) edits.push({ de: m.index!, a: m.index! + m[0].length, texte: /march[ée]\s*(n°\s*)?$/i.test(avant) ? v.replace(/^Marché n°\s*/i, '') : v })
      else if (/^indiquer\b/i.test(nom)) edits.push({ de: m.index!, a: m.index! + m[0].length, texte: '' })
    }
    for (const pt of spec.pointilles ?? []) if (correspond(pt, t, rangDe(pt))) {
      trouvees.add(cle(pt))
      let i = 0
      for (const m of brut.matchAll(RE_POINTILLES)) {
        const v = pt.valeurs[i++]
        if (v) edits.push({ de: m.index!, a: m.index! + m[0].length, texte: v })
      }
    }
    for (const [de, vers] of spec.remplacements ?? []) {
      const i = brut.indexOf(de)
      if (i >= 0) edits.push({ de: i, a: i + de.length, texte: vers })
    }
    q = editer(q, edits)
    for (const a of spec.ajouts ?? []) if (correspond(a, t, rangDe(a))) { trouvees.add(cle(a)); if (a.texte.trim()) q = q + paragraphesApres(q, a.texte) }
    return q
  })
  let xmlFinal = nouveau
  if (spec.annexes?.length) {
    const i = xmlFinal.lastIndexOf('<w:sectPr')
    const bloc = spec.annexes.map(xmlAnnexe).join('')
    xmlFinal = i >= 0 ? xmlFinal.slice(0, i) + bloc + xmlFinal.slice(i) : xmlFinal.replace('</w:body>', bloc + '</w:body>')
  }
  const manquantes = [...(spec.cases ?? []), ...(spec.pointilles ?? []), ...(spec.ajouts ?? [])]
    .filter((x) => !trouvees.has(cle(x))).map((x) => x.ancre)
  return { xml: xmlFinal, manquantes: [...new Set(manquantes)] }
}

/** Remplit un modèle .docx et rend le nouveau fichier. */
export async function remplirDocx(modele: ArrayBuffer | Uint8Array | Blob, spec: Spec): Promise<{ fichier: Blob; manquantes: string[] }> {
  const zip = await JSZip.loadAsync(modele)
  const doc = zip.file('word/document.xml')
  if (!doc) throw new Error('Ce fichier n’est pas un document Word (.docx) valide.')
  const { xml, manquantes } = remplirXml(await doc.async('string'), spec)
  zip.file('word/document.xml', xml)
  // En-têtes et pieds de page (n° du marché…) : seules les zones entre crochets sont remplies.
  for (const nom of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    zip.file(nom, remplirXml(await zip.file(nom)!.async('string'), { champs: spec.champs }).xml)
  }
  const fichier = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  return { fichier, manquantes }
}

/** Contrôle d'un modèle importé : document Word lisible, cases à cocher présentes, ancres retrouvées. */
export async function verifierModele(modele: ArrayBuffer | Blob, spec: Spec) {
  const zip = await JSZip.loadAsync(modele)
  const doc = zip.file('word/document.xml')
  if (!doc) throw new Error('Ce fichier n’est pas un document Word (.docx). Enregistrez-le au format .docx depuis Word.')
  const xml = await doc.async('string')
  return { cases: (xml.match(/FORMCHECKBOX/g) ?? []).length, manquantes: remplirXml(xml, spec).manquantes }
}
