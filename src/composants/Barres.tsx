import type { Synthese, Statut } from '../moteur'
import { taux, evalues, LIBELLE_STATUT } from '../moteur'

/** Barre empilée Conforme / sous tolérance / non conforme, avec le taux. */
export function BarreConformite({ s, large = false }: { s: Synthese; large?: boolean }) {
  const e = evalues(s)
  const t = taux(s)
  if (e === 0) return <span style={{ color: 'var(--encre-2)', fontSize: 12 }}>{s.aRenseigner ? `${s.aRenseigner} point(s) à renseigner` : 'Non évalué'}</span>
  const pc = (n: number) => `${(100 * n) / e}%`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={`${s.conformes} conforme(s), ${s.sousTolerance} sous tolérance, ${s.nonConformes} non conforme(s)`}>
      <div className="barre" style={{ flex: 1, height: large ? 12 : 8, minWidth: 60 }}>
        <i style={{ width: pc(s.conformes), background: 'var(--vert)' }} />
        <i style={{ width: pc(s.sousTolerance), background: 'var(--ct)' }} />
        <i style={{ width: pc(s.nonConformes), background: 'var(--rouge)' }} />
      </div>
      <b className="num" style={{ fontSize: large ? 16 : 13 }}>{t} %</b>
    </div>
  )
}

export function EtiquetteStatut({ statut }: { statut: Statut | null }) {
  return <span className={`etiquette s-${statut ?? 'vide'}`}>{statut ? LIBELLE_STATUT[statut] : 'À renseigner'}</span>
}
