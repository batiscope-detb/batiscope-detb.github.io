import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../ui'

/** En-tête des pages Visibat : fil d'Ariane, titre, sous-titre et actions à droite. */
export default function Entete({ fil, titre, sousTitre, children }: { fil?: { lien: string; libelle: string }[]; titre: ReactNode; sousTitre?: ReactNode; children?: ReactNode }) {
  return (
    <div className="vb-titre vb-ne-pas-imprimer">
      <div>
        <div className="vb-fil">
          <Link to="/visibat">Visibat</Link>
          {fil?.map((f) => <span key={f.lien}> › <Link to={f.lien}>{f.libelle}</Link></span>)}
        </div>
        <h1><Logo taille={30} />{titre}</h1>
        {sousTitre && <p className="sous-titre">{sousTitre}</p>}
      </div>
      {children}
    </div>
  )
}

/** Onglets Batiscope. */
export function Onglets<T extends string>({ valeur, choix, changer }: { valeur: T; choix: [T, string][]; changer: (v: T) => void }) {
  return (
    <div className="onglets vb-ne-pas-imprimer" role="tablist">
      {choix.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={valeur === k} onClick={() => changer(k)}>{l}</button>)}
    </div>
  )
}
