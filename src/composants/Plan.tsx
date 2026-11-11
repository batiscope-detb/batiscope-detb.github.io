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
      <div ref={cadre} className={`plan${viseur ? ' viseur' : ''}`} style={{ display: etat === 'ok' ? 'inline-block' : 'none' }}
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
    </div>
  )
}
