import { useState } from 'react'

export function Photos({ urls }: { urls: (string | undefined)[] }) {
  const [grande, setGrande] = useState<string | null>(null)
  const ok = urls.filter((u): u is string => !!u)
  if (!ok.length) return null
  return (
    <>
      <div className="photos">
        {ok.map((u) => <img key={u} src={u} alt="Photo du relevé" loading="lazy" onClick={() => setGrande(u)} />)}
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
