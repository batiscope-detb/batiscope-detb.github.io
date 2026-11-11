import { useState } from 'react'

export interface PhotoAffichee { id: string; url: string | undefined }

/** Vignettes cliquables (agrandissement) ; croix de suppression si surSupprimer est fourni. */
export function Photos({ urls, photos, surSupprimer }: { urls?: (string | undefined)[]; photos?: PhotoAffichee[]; surSupprimer?: (id: string) => void }) {
  const [grande, setGrande] = useState<string | null>(null)
  const liste: PhotoAffichee[] = photos ?? (urls ?? []).map((u, i) => ({ id: String(i), url: u }))
  const ok = liste.filter((p) => !!p.url)
  if (!ok.length) return null
  return (
    <>
      <div className="photos">
        {ok.map((p) => (
          <span key={p.id} className="vignette">
            <img src={p.url} alt="Photo du relevé" loading="lazy" onClick={() => setGrande(p.url!)} />
            {surSupprimer && <button type="button" className="supprimer-photo" aria-label="Supprimer la photo" title="Supprimer la photo" onClick={() => surSupprimer(p.id)}>×</button>}
          </span>
        ))}
      </div>
      {grande && (
        <div className="visionneuse" role="dialog" aria-label="Photo agrandie" onClick={() => setGrande(null)}
          onKeyDown={(e) => e.key === 'Escape' && setGrande(null)} tabIndex={-1} ref={(d) => d?.focus()}>
          <img src={grande} alt="Photo agrandie" />
        </div>
      )}
    </>
  )
}
