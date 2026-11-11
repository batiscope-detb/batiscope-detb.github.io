import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import urlTravailleur from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = urlTravailleur

export interface Repere { id: string; x: number; y: number; texte: string; titre: string; acc?: boolean; couleur?: string }

/** Affiche une page de plan PDF et superpose les repères (coordonnées relatives 0..1). */
export function Plan({ url, page, reperes }: { url: string; page: number; reperes: Repere[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur'>('chargement')

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
      if (!annule) setEtat('ok')
    }).catch(() => { if (!annule) setEtat('erreur') })
    return () => { annule = true; tache?.cancel(); doc.destroy() }
  }, [url, page])

  return (
    <div>
      {etat === 'chargement' && <div className="chargement" style={{ padding: 30 }}><span className="roue" />Chargement du plan…</div>}
      {etat === 'erreur' && <p className="erreur">Le plan n'a pas pu être affiché.</p>}
      <div className="plan" style={{ display: etat === 'ok' ? 'inline-block' : 'none' }}>
        <canvas ref={canvas} />
        {reperes.map((r) => (
          <span key={r.id} className={`repere${r.acc ? ' acc' : ''}`} title={r.titre}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, background: r.couleur }}>{r.texte}</span>
        ))}
      </div>
    </div>
  )
}
