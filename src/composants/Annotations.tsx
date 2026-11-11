import { useRef, useState, type PointerEvent as PE, type ReactNode } from 'react'
import type { Annotation } from '../donnees'
import { famille, legendeSymbole, svgSymbole, symboleParId, TAILLES, type Symbole } from '../symboles'

export type NouvelleAnnotation = Pick<Annotation, 'type' | 'x' | 'y' | 'points'>

interface Props {
  ratio: number
  annotations: Annotation[]
  /** Familles affichées. */
  visibles: Set<string>
  /** Outil en cours de pose (symbole ou outil d'annotation), ou null. */
  outil: Symbole | null
  edition: boolean
  selection: string | null
  creer: (a: NouvelleAnnotation) => void
  deplacer: (id: string, dx: number, dy: number) => void
  choisir: (id: string | null) => void
}

const L = 1000 // largeur du repère de dessin ; hauteur = L × ratio
const TAILLE_TEXTE = { s: 12, m: 16, l: 22 }
const EPAISSEUR = { s: 2, m: 3, l: 5 }

/** Calque SVG des symboles et annotations, posé exactement sur la page du plan. */
export function CalqueAnnotations({ ratio, annotations, visibles, outil, edition, selection, creer, deplacer, choisir }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const H = L * ratio
  const [trace, setTrace] = useState<[number, number][] | null>(null)
  const [glisse, setGlisse] = useState<{ id: string; depart: [number, number]; dx: number; dy: number } | null>(null)

  const relatif = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }

  // --- Pose d'un nouvel élément -----------------------------------------------------------------
  function bas(e: PE<SVGSVGElement>) {
    if (!outil) return
    e.preventDefault()
    svg.current!.setPointerCapture(e.pointerId)
    setTrace([relatif(e)])
  }
  function mouvement(e: PE<SVGSVGElement>) {
    if (glisse) {
      const [x, y] = relatif(e)
      setGlisse({ ...glisse, dx: x - glisse.depart[0], dy: y - glisse.depart[1] })
      return
    }
    if (!outil || !trace) return
    const p = relatif(e)
    if (outil.geometrie === 'libre') {
      const d = trace[trace.length - 1]
      if (Math.hypot(p[0] - d[0], (p[1] - d[1]) * ratio) > 0.003) setTrace([...trace, p])
    } else setTrace([trace[0], p])
  }
  function haut(e: PE<SVGSVGElement>) {
    if (glisse) {
      if (Math.hypot(glisse.dx, glisse.dy * ratio) > 0.002) deplacer(glisse.id, glisse.dx, glisse.dy)
      else choisir(glisse.id)
      setGlisse(null)
      return
    }
    if (!outil || !trace) return
    const fin = trace.length > 1 ? trace[trace.length - 1] : relatif(e)
    const [x, y] = trace[0]
    const longueur = Math.hypot(fin[0] - x, (fin[1] - y) * ratio)
    if (outil.geometrie === 'symbole' || outil.geometrie === 'point') creer({ type: outil.id, x, y, points: null })
    else if (outil.geometrie === 'libre') { if (trace.length > 2) creer({ type: outil.id, x, y, points: trace }) }
    else if (longueur > 0.01) creer({ type: outil.id, x, y, points: [fin] })
    setTrace(null)
  }

  // --- Déplacement d'un élément existant ----------------------------------------------------------
  function saisir(e: PE<SVGGElement>, a: Annotation) {
    if (outil) return
    e.stopPropagation()
    if (!edition) { choisir(a.id); return }
    e.currentTarget.setPointerCapture(e.pointerId)
    setGlisse({ id: a.id, depart: relatif(e), dx: 0, dy: 0 })
  }

  const X = (x: number) => x * L
  const Y = (y: number) => y * H

  function dessiner(a: Annotation, apercu = false): ReactNode {
    const s = symboleParId.get(a.type)
    if (!s) return null
    const g = glisse?.id === a.id ? glisse : null
    const dx = g?.dx ?? 0, dy = g?.dy ?? 0
    const x = a.x + dx, y = a.y + dy
    const pts = (a.points ?? []).map(([px, py]) => [px + dx, py + dy] as [number, number])
    const coul = a.couleur ?? famille(s.famille)?.couleur ?? '#2E2B57'
    const choisi = selection === a.id
    const commun = {
      key: a.id, className: `annotation${choisi ? ' choisie' : ''}${edition && !outil ? ' mobile' : ''}`,
      onPointerDown: apercu ? undefined : (e: PE<SVGGElement>) => saisir(e, a),
    }
    switch (s.geometrie) {
      case 'symbole': {
        const t = TAILLES[a.taille] * L
        const legende = legendeSymbole(s, a.valeur)
        return (
          <g {...commun}>
            {choisi && <rect x={X(x) - t * 0.62} y={Y(y) - t * 0.62} width={t * 1.24} height={t * 1.24} rx={t * 0.2} className="halo" />}
            <g transform={`translate(${X(x)} ${Y(y)}) rotate(${s.orientable ? a.rotation : 0}) scale(${t / 48}) translate(-24 -24)`}
              dangerouslySetInnerHTML={{ __html: svgSymbole(s, a.valeur) }} />
            {legende && <text x={X(x)} y={Y(y) + t * 0.5 + t * 0.42} textAnchor="middle" fontSize={t * 0.36} className="etiquette-plan" fontFamily="Inter, Arial, sans-serif" fontWeight={600} fill="#1B1B3D">{legende}</text>}
          </g>
        )
      }
      case 'point': {
        const fs = TAILLE_TEXTE[a.taille]
        const lignes = (a.valeur || 'Texte').split('\n')
        return (
          <g {...commun}>
            <text x={X(x)} y={Y(y)} fontSize={fs} fill={coul} fontWeight={600} className="texte-plan" fontFamily="Inter, Arial, sans-serif">
              {lignes.map((l, i) => <tspan key={i} x={X(x)} dy={i ? fs * 1.2 : 0}>{l}</tspan>)}
            </text>
            {choisi && <rect x={X(x) - 4} y={Y(y) - fs} width={Math.max(...lignes.map((l) => l.length)) * fs * 0.6 + 8} height={fs * 1.2 * lignes.length + 6} className="halo" />}
          </g>
        )
      }
      case 'segment': {
        const [x2, y2] = pts[0] ?? [x, y]
        const ep = EPAISSEUR[a.taille]
        const ang = Math.atan2(Y(y2) - Y(y), X(x2) - X(x))
        const deg = (ang * 180) / Math.PI
        const mx = (X(x) + X(x2)) / 2, my = (Y(y) + Y(y2)) / 2
        const lisible = deg > 90 || deg < -90 ? deg + 180 : deg
        if (s.id === 'cote') {
          const n = 7, ox = Math.sin(ang) * n, oy = -Math.cos(ang) * n
          return (
            <g {...commun} stroke={coul} strokeWidth={ep * 0.6} fill="none">
              <line x1={X(x)} y1={Y(y)} x2={X(x2)} y2={Y(y2)} className="zone-saisie" strokeWidth={14} stroke="transparent" />
              <line x1={X(x)} y1={Y(y)} x2={X(x2)} y2={Y(y2)} />
              <line x1={X(x) - ox} y1={Y(y) - oy} x2={X(x) + ox} y2={Y(y) + oy} />
              <line x1={X(x2) - ox} y1={Y(y2) - oy} x2={X(x2) + ox} y2={Y(y2) + oy} />
              {choisi && <line x1={X(x)} y1={Y(y)} x2={X(x2)} y2={Y(y2)} className="halo-trait" />}
              <text x={mx} y={my - 6} transform={`rotate(${lisible} ${mx} ${my})`} textAnchor="middle" fontSize={TAILLE_TEXTE[a.taille]} fill={coul} stroke="none" fontWeight={700} className="texte-plan" fontFamily="Inter, Arial, sans-serif">
                {a.valeur ? `${a.valeur}${/^[\d,.]+$/.test(a.valeur) ? ' m' : ''}` : '?'}
              </text>
            </g>
          )
        }
        const pointe = 8 + ep * 2
        return (
          <g {...commun} stroke={coul} strokeWidth={ep} fill="none" strokeLinecap="round">
            <line x1={X(x)} y1={Y(y)} x2={X(x2)} y2={Y(y2)} className="zone-saisie" strokeWidth={14} stroke="transparent" />
            <line x1={X(x)} y1={Y(y)} x2={X(x2)} y2={Y(y2)} />
            <path d={`M ${X(x2) - pointe * Math.cos(ang - 0.45)} ${Y(y2) - pointe * Math.sin(ang - 0.45)} L ${X(x2)} ${Y(y2)} L ${X(x2) - pointe * Math.cos(ang + 0.45)} ${Y(y2) - pointe * Math.sin(ang + 0.45)}`} strokeLinejoin="round" />
            {choisi && <line x1={X(x)} y1={Y(y)} x2={X(x2)} y2={Y(y2)} className="halo-trait" />}
            {a.valeur && <text x={X(x)} y={Y(y) - 6} textAnchor="middle" fontSize={TAILLE_TEXTE[a.taille]} fill={coul} stroke="none" fontWeight={600} className="texte-plan" fontFamily="Inter, Arial, sans-serif">{a.valeur}</text>}
          </g>
        )
      }
      case 'rectangle': {
        const [x2, y2] = pts[0] ?? [x, y]
        const rx = Math.min(X(x), X(x2)), ry = Math.min(Y(y), Y(y2)), w = Math.abs(X(x2) - X(x)), h = Math.abs(Y(y2) - Y(y))
        const ep = EPAISSEUR[a.taille]
        const motif = `hachure-${coul.replace('#', '')}`
        return (
          <g {...commun}>
            {s.id === 'nuage'
              ? <path d={nuage(rx, ry, w, h)} fill={choisi ? 'rgba(200,138,18,.08)' : 'transparent'} stroke={coul} strokeWidth={ep * 0.7} strokeLinejoin="round" />
              : <>
                <defs><pattern id={motif} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V10" stroke={coul} strokeWidth="2" /></pattern></defs>
                <rect x={rx} y={ry} width={w} height={h} fill={`url(#${motif})`} fillOpacity={0.3} stroke={coul} strokeWidth={ep * 0.7} strokeDasharray="8 5" />
              </>}
            {choisi && <rect x={rx - 4} y={ry - 4} width={w + 8} height={h + 8} className="halo" />}
            {a.valeur && <text x={rx + w / 2} y={ry + h + TAILLE_TEXTE[a.taille] + 2} textAnchor="middle" fontSize={TAILLE_TEXTE[a.taille]} fill={coul} fontWeight={600} className="texte-plan" fontFamily="Inter, Arial, sans-serif">{a.valeur}</text>}
          </g>
        )
      }
      case 'libre': {
        const d = [[x, y] as [number, number], ...pts.slice(1)].map(([px, py], i) => `${i ? 'L' : 'M'} ${X(px)} ${Y(py)}`).join(' ')
        return (
          <g {...commun} fill="none" stroke={coul} strokeLinecap="round" strokeLinejoin="round">
            <path d={d} strokeWidth={14} stroke="transparent" className="zone-saisie" />
            <path d={d} strokeWidth={EPAISSEUR[a.taille]} />
            {choisi && <path d={d} className="halo-trait" />}
          </g>
        )
      }
    }
  }

  // Aperçu pendant le tracé
  const apercu: Annotation | null = outil && trace && outil.geometrie !== 'symbole' && outil.geometrie !== 'point' && trace.length > 1
    ? { id: '__apercu', niveau_id: '', type: outil.id, x: trace[0][0], y: trace[0][1], points: outil.geometrie === 'libre' ? trace : [trace[trace.length - 1]],
        rotation: 0, taille: 'm', valeur: null, commentaire: null, couleur: null, lien_type: null, lien_id: null }
    : null

  return (
    <svg ref={svg} className={`calque-annotations${outil ? ' pose' : ''}`} viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none"
      onPointerDown={bas} onPointerMove={mouvement} onPointerUp={haut} onClick={(e) => { if (!outil && e.target === svg.current) choisir(null) }}>
      {annotations.filter((a) => visibles.has(symboleParId.get(a.type)?.famille ?? '')).map((a) => dessiner(a))}
      {apercu && <g opacity={0.6}>{dessiner(apercu, true)}</g>}
    </svg>
  )
}

/** Contour en « nuage » autour d'un rectangle (arcs réguliers). */
function nuage(x: number, y: number, w: number, h: number): string {
  const r = Math.max(8, Math.min(22, Math.min(w, h) / 4))
  const arcs = (x1: number, y1: number, x2: number, y2: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / (r * 1.6)))
    let d = ''
    for (let i = 1; i <= n; i++) d += ` A ${r} ${r} 0 0 1 ${x1 + ((x2 - x1) * i) / n} ${y1 + ((y2 - y1) * i) / n}`
    return d
  }
  return `M ${x} ${y}${arcs(x, y, x + w, y)}${arcs(x + w, y, x + w, y + h)}${arcs(x + w, y + h, x, y + h)}${arcs(x, y + h, x, y)} Z`
}

/** Vignette d'un symbole ou d'un outil (palette, légende). */
export function IconeSymbole({ s, taille = 32 }: { s: Symbole; taille?: number }) {
  return <svg viewBox="0 0 48 48" width={taille} height={taille} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icone(s) }} />
}

const ICONES_OUTILS: Record<string, string> = {
  texte: '<text x="24" y="31" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#2E2B57">Aa</text>',
}
function icone(s: Symbole): string {
  if (s.geometrie === 'symbole') return svgSymbole(s, null)
  return ICONES_OUTILS[s.id] ?? s.svg
}
