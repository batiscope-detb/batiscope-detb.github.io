import { useEffect, useRef, useState, type PointerEvent as PE, type ReactNode } from 'react'
import * as pdfjs from 'pdfjs-dist'
import urlTravailleur from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = urlTravailleur

export interface Repere { id: string; x: number; y: number; texte: string; titre: string; acc?: boolean; couleur?: string }

interface Props {
  url: string; page: number; reperes: Repere[]
  /** Clic sur le plan (coordonnées relatives 0..1) — mode placement. */
  surClic?: (x: number, y: number) => void
  /** Repère glissé à une nouvelle position. */
  surDeplacement?: (id: string, x: number, y: number) => void
  surChoix?: (id: string) => void
  selection?: string | null
  viseur?: boolean
  /** Calque dessiné au-dessus du plan (ratio = hauteur / largeur de la page). */
  superposition?: (ratio: number) => ReactNode
  /** Plan rendu (pour l'export en image). */
  surRendu?: (c: HTMLCanvasElement) => void
}

const borne = (v: number) => Math.min(1, Math.max(0, v))

/** Affiche une page de plan PDF et superpose les repères (coordonnées relatives à la page, comme sur la tablette). */
export function Plan({ url, page, reperes, surClic, surDeplacement, surChoix, selection, viseur, superposition, surRendu }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const cadre = useRef<HTMLDivElement>(null)
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur'>('chargement')
  const [ratio, setRatio] = useState(1)
  const [glisse, setGlisse] = useState<{ id: string; x: number; y: number; depart: [number, number]; bouge: boolean } | null>(null)
  // Zoom (molette) et déplacement de la vue (cliquer-glisser sur le plan).
  const vue = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState({ z: 1, x: 0, y: 0 })
  const pan = useRef<{ x: number; y: number; ox: number; oy: number; bouge: boolean } | null>(null)
  const avalerClic = useRef(false)

  useEffect(() => {
    const v = vue.current
    if (!v) return
    // Écouteur natif non passif : la molette zoome le plan au lieu de faire défiler la page.
    const molette = (e: WheelEvent) => {
      e.preventDefault()
      const r = v.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      setZoom((o) => {
        const z = Math.min(8, Math.max(1, o.z * Math.exp(-e.deltaY * 0.0015)))
        if (z === 1) return { z: 1, x: 0, y: 0 }
        return { z, x: px - ((px - o.x) * z) / o.z, y: py - ((py - o.y) * z) / o.z }
      })
    }
    v.addEventListener('wheel', molette, { passive: false })
    return () => v.removeEventListener('wheel', molette)
  }, [etat])
  useEffect(() => { setZoom({ z: 1, x: 0, y: 0 }) }, [url, page])

  function zoomer(f: number) {
    const v = vue.current
    if (!v) return
    const px = v.clientWidth / 2, py = v.clientHeight / 2
    setZoom((o) => {
      const z = Math.min(8, Math.max(1, o.z * f))
      return z === 1 ? { z: 1, x: 0, y: 0 } : { z, x: px - ((px - o.x) * z) / o.z, y: py - ((py - o.y) * z) / o.z }
    })
  }
  function panDebut(e: PE<HTMLDivElement>) {
    if (zoom.z === 1 || (e.button !== 0 && e.button !== 1)) return
    if ((e.target as Element).closest('.calque-annotations.pose, .repere, .annotation')) return
    pan.current = { x: e.clientX, y: e.clientY, ox: zoom.x, oy: zoom.y, bouge: false }
  }
  function panMouvement(e: PE<HTMLDivElement>) {
    const p = pan.current
    if (!p) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    if (!p.bouge && Math.hypot(dx, dy) < 5) return
    if (!p.bouge) { p.bouge = true; e.currentTarget.setPointerCapture(e.pointerId) }
    setZoom((o) => ({ ...o, x: p.ox + dx, y: p.oy + dy }))
  }
  function panFin() {
    if (pan.current?.bouge) avalerClic.current = true
    pan.current = null
  }

  useEffect(() => {
    let annule = false
    let tache: pdfjs.RenderTask | null = null
    setEtat('chargement')
    const doc = pdfjs.getDocument({ url })
    doc.promise.then(async (pdf) => {
      const p = await pdf.getPage(Math.min(Math.max(1, page + 1), pdf.numPages))
      if (annule || !canvas.current) return
      const base = p.getViewport({ scale: 1 })
      const echelle = Math.min(3, 2400 / Math.max(base.width, base.height))
      const vue = p.getViewport({ scale: echelle })
      const c = canvas.current
      c.width = vue.width; c.height = vue.height
      tache = p.render({ canvasContext: c.getContext('2d')!, viewport: vue })
      await tache.promise
      if (!annule) { setRatio(vue.height / vue.width); setEtat('ok'); surRendu?.(c) }
    }).catch(() => { if (!annule) setEtat('erreur') })
    return () => { annule = true; tache?.cancel(); doc.destroy() }
  }, [url, page])

  const relatif = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect()
    return [borne((e.clientX - r.left) / r.width), borne((e.clientY - r.top) / r.height)]
  }

  function debut(e: PE<HTMLSpanElement>, r: Repere) {
    e.stopPropagation()
    if (!surDeplacement) { surChoix?.(r.id); return }
    e.currentTarget.setPointerCapture(e.pointerId)
    setGlisse({ id: r.id, x: r.x, y: r.y, depart: [e.clientX, e.clientY], bouge: false })
  }
  function mouvement(e: PE<HTMLSpanElement>) {
    if (!glisse) return
    const bouge = glisse.bouge || Math.hypot(e.clientX - glisse.depart[0], e.clientY - glisse.depart[1]) > 4
    const [x, y] = relatif(e)
    setGlisse({ ...glisse, x, y, bouge })
  }
  function fin() {
    if (!glisse) return
    if (glisse.bouge) surDeplacement?.(glisse.id, glisse.x, glisse.y)
    else surChoix?.(glisse.id)
    setGlisse(null)
  }

  return (
    <div>
      {etat === 'chargement' && <div className="chargement" style={{ padding: 30 }}><span className="roue" />Chargement du plan…</div>}
      {etat === 'erreur' && <p className="erreur">Le plan n'a pas pu être affiché.</p>}
      <div ref={vue} className={`plan-vue${zoom.z > 1 ? ' zoome' : ''}`} style={{ display: etat === 'ok' ? 'block' : 'none' }}
        onPointerDown={panDebut} onPointerMove={panMouvement} onPointerUp={panFin} onPointerCancel={panFin}
        onClickCapture={(e) => { if (avalerClic.current) { avalerClic.current = false; e.stopPropagation(); e.preventDefault() } }}>
        <div ref={cadre} className={`plan${viseur ? ' viseur' : ''}`}
          style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})`, ['--zoom' as string]: zoom.z }}
          onClick={(e) => surClic && etat === 'ok' && surClic(...relatif(e))}>
          <canvas ref={canvas} />
          {etat === 'ok' && superposition?.(ratio)}
          {reperes.map((r) => {
            const g = glisse?.id === r.id ? glisse : null
            return (
              <span key={r.id} className={`repere${r.acc ? ' acc' : ''}${selection === r.id ? ' choisi' : ''}${surDeplacement ? ' mobile' : ''}`} title={r.titre}
                style={{ left: `${(g?.x ?? r.x) * 100}%`, top: `${(g?.y ?? r.y) * 100}%`, background: r.couleur }}
                onPointerDown={(e) => debut(e, r)} onPointerMove={mouvement} onPointerUp={fin} onClick={(e) => e.stopPropagation()}>{r.texte}</span>
            )
          })}
        </div>
        <div className="zoom-commandes" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => zoomer(1.4)} aria-label="Zoomer" title="Zoomer (molette)">+</button>
          <button type="button" onClick={() => zoomer(1 / 1.4)} aria-label="Dézoomer" title="Dézoomer (molette)">−</button>
          <button type="button" onClick={() => setZoom({ z: 1, x: 0, y: 0 })} disabled={zoom.z === 1} aria-label="Plan entier" title="Plan entier">⤢</button>
          {zoom.z > 1 && <span>{Math.round(zoom.z * 100)} %</span>}
        </div>
      </div>
    </div>
  )
}
