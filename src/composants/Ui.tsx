import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react'

// --- Notifications -------------------------------------------------------------------------------
type Genre = 'ok' | 'erreur'
export function signaler(texte: string, genre: Genre = 'ok') {
  window.dispatchEvent(new CustomEvent('detb-signal', { detail: { texte, genre } }))
}

export function Notifications() {
  const [liste, setListe] = useState<{ id: number; texte: string; genre: Genre }[]>([])
  useEffect(() => {
    const f = (e: Event) => {
      const { texte, genre } = (e as CustomEvent).detail
      const id = Date.now() + Math.random()
      setListe((l) => [...l, { id, texte, genre }])
      setTimeout(() => setListe((l) => l.filter((x) => x.id !== id)), genre === 'erreur' ? 8000 : 2500)
    }
    window.addEventListener('detb-signal', f)
    return () => window.removeEventListener('detb-signal', f)
  }, [])
  return (
    <div className="notifications" role="status" aria-live="polite">
      {liste.map((n) => <div key={n.id} className={`notification ${n.genre}`}>{n.texte}</div>)}
    </div>
  )
}

/** Exécute une écriture : message de réussite, ou d'erreur lisible. Renvoie le résultat (null si échec). */
export async function executer<T>(f: () => Promise<T>, succes?: string): Promise<T | null> {
  try {
    const r = await f()
    if (succes && r !== null) signaler(succes)
    return r
  } catch (e) {
    signaler(e instanceof Error ? e.message : String(e), 'erreur')
    return null
  }
}

// --- Fenêtre de saisie -----------------------------------------------------------------------------
export function Dialogue({ titre, ouvert, fermer, valider, children, libelleValider = 'Enregistrer', danger, large }: {
  titre: string; ouvert: boolean; fermer: () => void; valider?: () => Promise<unknown> | void; children: ReactNode
  libelleValider?: string; danger?: { libelle: string; action: () => Promise<unknown> | void }; large?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [enCours, setEnCours] = useState(false)
  // Fenêtre déplaçable en la tirant par son titre (position remise au centre à chaque ouverture).
  const [decalage, setDecalage] = useState({ x: 0, y: 0 })
  const tire = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (ouvert && !d.open) { setDecalage({ x: 0, y: 0 }); d.style.width = ''; d.style.height = ''; d.showModal() }
    if (!ouvert && d.open) d.close()
  }, [ouvert])
  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!valider) return fermer()
    setEnCours(true)
    try { await valider() } finally { setEnCours(false) }
  }
  return (
    <dialog ref={ref} className={`dialogue${large ? ' large' : ''}`} onClose={fermer} onCancel={fermer}
      style={{ transform: `translate(${decalage.x}px, ${decalage.y}px)` }}>
      {ouvert && (
        <form onSubmit={soumettre}>
          <h2 className="poignee" title="Faites glisser pour déplacer la fenêtre"
            onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); tire.current = { x: e.clientX, y: e.clientY, ox: decalage.x, oy: decalage.y } }}
            onPointerMove={(e) => { const t = tire.current; if (t) setDecalage({ x: t.ox + e.clientX - t.x, y: t.oy + e.clientY - t.y }) }}
            onPointerUp={() => { tire.current = null }} onDoubleClick={() => setDecalage({ x: 0, y: 0 })}>{titre}</h2>
          <div className="dialogue-corps">{children}</div>
          <div className="dialogue-actions">
            {danger && <button type="button" className="bouton danger" disabled={enCours} style={{ marginRight: 'auto' }}
              onClick={async () => { setEnCours(true); try { await danger.action() } finally { setEnCours(false) } }}>{danger.libelle}</button>}
            <button type="button" className="bouton" onClick={fermer}>Annuler</button>
            {valider && <button className="bouton primaire" disabled={enCours}>{enCours ? 'Enregistrement…' : libelleValider}</button>}
          </div>
        </form>
      )}
    </dialog>
  )
}

/** Champ libellé + contrôle. */
export function Champ({ libelle, children, aide }: { libelle: string; children: ReactNode; aide?: string }) {
  return <label className="champ-form"><span>{libelle}</span>{children}{aide && <small>{aide}</small>}</label>
}

/** Nombre saisi à la française (virgule acceptée) ; vide = null. */
export const lireNombre = (t: string): number | null => {
  const v = t.trim().replace(/\s/g, '').replace(',', '.')
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
export const ecrireNombre = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

/** Choix de fichier déclenché par un bouton. */
export function BoutonFichier({ libelle, accept, multiple, choisir, className = 'bouton' }: {
  libelle: string; accept: string; multiple?: boolean; choisir: (f: File[]) => void; className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>{libelle}</button>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) choisir(f) }} />
    </>
  )
}
