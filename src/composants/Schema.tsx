/** Schémas cotés des exigences d'accessibilité (dessins Batiscope), affichés sous le statut d'un point de contrôle. */
import { useState } from 'react'
import donnees from '../data/schemas.json'
import { Dialogue } from './Ui'

const { titres, regles } = donnees as { titres: Record<string, string>; regles: Record<string, string> }

export const schemaDe = (regleId: string): string | null => regles[regleId] ?? null
const url = (nom: string) => `${import.meta.env.BASE_URL}schemas/${nom}.svg`

/** Vignette cliquable ; `compact` : simple lien quand le même schéma est déjà montré plus haut. */
export function SchemaRegle({ regleId, compact }: { regleId: string; compact?: boolean }) {
  const [ouvert, setOuvert] = useState(false)
  const nom = schemaDe(regleId)
  if (!nom) return null
  return (
    <>
      {compact
        ? <button type="button" className="lien-photo" onClick={() => setOuvert(true)}>Voir le schéma</button>
        : <button type="button" className="vignette-schema" onClick={() => setOuvert(true)} title={`${titres[nom]} — agrandir`}>
            <img src={url(nom)} alt={titres[nom]} loading="lazy" />
          </button>}
      {ouvert && (
        <Dialogue titre={titres[nom]} ouvert large fermer={() => setOuvert(false)}>
          <img src={url(nom)} alt={titres[nom]} className="schema-grand" />
          <p className="note-param">Schéma de principe Batiscope, d'après l'arrêté du 8 décembre 2014 modifié. Les valeurs du référentiel font foi.</p>
        </Dialogue>
      )}
    </>
  )
}
