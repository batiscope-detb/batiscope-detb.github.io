import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { vb } from '../donnees'

/** Sur la fiche d'un bâtiment de Batiscope : ses chantiers suivis dans Visibat. */
export default function ChantiersDuBatiment({ projetId }: { projetId: string }) {
  const [ops, setOps] = useState<{ id: string; nom: string; archive: boolean }[] | null>(null)
  useEffect(() => {
    vb().from('operation').select('id,nom,archive').eq('projet_id', projetId).is('supprime_le', null).order('nom')
      .then(({ data }) => setOps((data ?? []) as { id: string; nom: string; archive: boolean }[]), () => setOps([]))
  }, [projetId])
  if (!ops?.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13 }}>
      <span style={{ color: 'var(--encre-2)' }}>Chantiers Visibat :</span>
      {ops.map((o) => <Link key={o.id} className="bouton petit" to={`/visibat/operation/${o.id}`}>{o.nom}{o.archive ? ' (archivé)' : ''}</Link>)}
    </div>
  )
}
