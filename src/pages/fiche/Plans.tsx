import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { fusionner } from '../../donnees'
import { ecrire, supprimer } from '../../ecriture'
import { nouvelId } from '../../ids'
import { executer } from '../../composants/Ui'
import type { Repere } from '../../composants/Plan'
import { couleurEtat, useFiche } from './contexte'

const Plan = lazy(() => import('../../composants/Plan').then((m) => ({ default: m.Plan })))

type Cible = { genre: 'local' | 'element'; id: string; libelle: string }

export default function Plans() {
  const { ind, niveaux, locaux, constats, detail, urls, edition, majDetail, modifier } = useFiche()
  const [choix, setChoix] = useState<string | null>(null)
  const [aPlacer, setAPlacer] = useState<Cible | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  if (!detail) return <div className="chargement"><span className="roue" />Chargement des plans…</div>
  if (!niveaux.length) return <p className="vide">Aucun niveau. Créez-les dans l'onglet <Link to="?onglet=batiment">Niveaux et locaux</Link>.</p>

  const niv = niveaux.find((n) => n.id === choix) ?? niveaux.find((n) => detail.plans.some((p) => p.niveau_id === n.id && p.storage_path)) ?? niveaux[0]
  const plan = detail.plans.find((pl) => pl.niveau_id === niv.id && pl.storage_path)
  const url = plan?.storage_path ? urls.get(plan.storage_path) : undefined
  const marqueurs = detail.marqueurs.filter((m) => m.niveau_id === niv.id)
  const locauxNiveau = locaux.filter((l) => l.niveau_id === niv.id)
  const elementsNiveau = ind.elements.filter((e) => e.element.niveau_id === niv.id)
  const localParId = new Map(locaux.map((l) => [l.id, l]))

  const reperes: Repere[] = [
    ...marqueurs.map((m) => {
      const l = localParId.get(m.local_id)
      return { id: m.id, x: m.x_relatif, y: m.y_relatif, texte: String(m.numero), titre: l?.libelle ?? 'Local', couleur: couleurEtat(l?.etat_general) }
    }),
    ...elementsNiveau.filter((e) => e.element.plan_x != null && e.element.plan_y != null).map((e) => ({
      id: e.element.id, x: e.element.plan_x!, y: e.element.plan_y!, acc: true,
      texte: e.synthese.nonConformes ? `${e.synthese.nonConformes}` : '✓', titre: `${e.element.libelle} — ${e.synthese.nonConformes} non-conformité(s)`,
    })),
  ]

  async function placer(x: number, y: number) {
    if (!aPlacer) return
    if (aPlacer.genre === 'local') {
      const numero = Math.max(0, ...marqueurs.map((m) => m.numero)) + 1
      const r = await executer(() => ecrire('releves', 'marqueur_local', { niveau_id: niv.id, local_id: aPlacer.id, x_relatif: x, y_relatif: y, numero }, { cle: { id: nouvelId() } }), `Repère ${numero} posé`)
      if (r) majDetail((d) => ({ ...d, marqueurs: fusionner(d.marqueurs, r, (m) => m.id) }))
    } else await placerElement(aPlacer.id, x, y)
    setAPlacer(null)
  }

  async function placerElement(id: string, x: number | null, y: number | null) {
    const e = ind.elements.find((z) => z.element.id === id)?.element
    if (!e) return
    const r = await executer(() => ecrire('accessibilite', 'element', { plan_x: x, plan_y: y }, { cle: { id }, majLeConnue: e.maj_le ?? null }))
    if (r) modifier((p) => ({ ...p, elements: fusionner(p.elements, r, (z) => z.id) }))
  }

  async function deplacer(id: string, x: number, y: number) {
    const m = marqueurs.find((z) => z.id === id)
    if (m) {
      const r = await executer(() => ecrire('releves', 'marqueur_local', { x_relatif: x, y_relatif: y }, { cle: { id }, majLeConnue: m.maj_le ?? null }))
      if (r) majDetail((d) => ({ ...d, marqueurs: fusionner(d.marqueurs, r, (z) => z.id) }))
    } else await placerElement(id, x, y)
  }

  async function retirer(id: string) {
    const m = marqueurs.find((z) => z.id === id)
    if (m) {
      const r = await executer(() => supprimer('releves', 'marqueur_local', { id }, m.maj_le ?? null), 'Repère retiré')
      if (r) majDetail((d) => ({ ...d, marqueurs: d.marqueurs.filter((z) => z.id !== id) }))
    } else await placerElement(id, null, null)
    setSelection(null)
  }

  const libelleSelection = selection && (marqueurs.find((m) => m.id === selection)
    ? `Repère ${marqueurs.find((m) => m.id === selection)!.numero} — ${localParId.get(marqueurs.find((m) => m.id === selection)!.local_id)?.libelle ?? ''}`
    : elementsNiveau.find((e) => e.element.id === selection)?.element.libelle)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="filtres">
        <label>Niveau
          <select className="champ" value={niv.id} onChange={(e) => { setChoix(e.target.value); setAPlacer(null); setSelection(null) }}>
            {niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}{detail.plans.some((p) => p.niveau_id === n.id && p.storage_path) ? '' : ' (sans plan)'}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12, color: 'var(--encre-2)', alignSelf: 'center' }}>
          Ronds : locaux (couleur selon l'état général) — carrés dorés : éléments accessibilité (nombre de non-conformités).
          {edition && ' Glissez un repère pour le déplacer, cliquez dessus pour le sélectionner.'}
        </span>
      </div>

      {!plan ? <p className="vide">Pas de plan pour ce niveau. Importez-le dans l'onglet <Link to="?onglet=batiment">Niveaux et locaux</Link>.</p> : (
        <div className={edition ? 'plan-edition' : ''}>
          <div>
            {aPlacer && <p className="bandeau-placement">Cliquez sur le plan à l'emplacement de « {aPlacer.libelle} ». <button className="bouton petit" onClick={() => setAPlacer(null)}>Annuler</button></p>}
            {selection && edition && !aPlacer && (
              <p className="bandeau-placement">Sélection : {libelleSelection}
                <button className="bouton petit" onClick={() => retirer(selection)}>Retirer du plan</button>
                <button className="bouton petit" onClick={() => setSelection(null)}>Fermer</button></p>
            )}
            {url ? (
              <Suspense fallback={<div className="chargement"><span className="roue" />Chargement de la visionneuse…</div>}>
                <Plan url={url} page={plan.page_index} reperes={reperes} viseur={!!aPlacer} selection={selection}
                  surClic={aPlacer ? placer : undefined} surDeplacement={edition && !aPlacer ? deplacer : undefined} surChoix={edition ? setSelection : undefined} />
              </Suspense>
            ) : <div className="chargement"><span className="roue" />Préparation du plan…</div>}
          </div>

          {edition && (
            <aside className="carte panneau-plan">
              <h3>Locaux du niveau</h3>
              {locauxNiveau.length === 0 && <p className="vide" style={{ padding: 6 }}>Aucun local sur ce niveau.</p>}
              <ul className="liste-placement">
                {locauxNiveau.map((l) => {
                  const m = marqueurs.find((z) => z.local_id === l.id)
                  return (
                    <li key={l.id}>
                      <span>{m ? <b className="pastille-num">{m.numero}</b> : <span className="pastille-num vide">–</span>} {l.libelle}</span>
                      {m ? <button className="bouton petit" onClick={() => setSelection(m.id)}>Voir</button>
                        : <button className="bouton petit primaire" onClick={() => setAPlacer({ genre: 'local', id: l.id, libelle: l.libelle })}>Placer</button>}
                    </li>
                  )
                })}
              </ul>
              {elementsNiveau.length > 0 && <>
                <h3 style={{ marginTop: 14 }}>Éléments accessibilité</h3>
                <ul className="liste-placement">
                  {elementsNiveau.map(({ element: e }) => (
                    <li key={e.id}>
                      <span>{e.libelle} <small style={{ color: 'var(--encre-2)' }}>{e.element_type}</small></span>
                      {e.plan_x != null ? <button className="bouton petit" onClick={() => setSelection(e.id)}>Voir</button>
                        : <button className="bouton petit primaire" onClick={() => setAPlacer({ genre: 'element', id: e.id, libelle: e.libelle })}>Placer</button>}
                    </li>
                  ))}
                </ul>
              </>}
            </aside>
          )}
        </div>
      )}

      {plan && marqueurs.length > 0 && (
        <section className="carte">
          <h2>Légende</h2>
          <table className="tableau"><tbody>
            {marqueurs.slice().sort((a, b) => a.numero - b.numero).map((m) => {
              const l = localParId.get(m.local_id)
              return <tr key={m.id}><td className="num" style={{ width: 40 }}>{m.numero}</td><td>{l?.libelle ?? '—'}</td><td>{l?.type ?? ''}</td>
                <td>{constats.filter((c) => c.local_id === m.local_id).length} constat(s)</td></tr>
            })}
          </tbody></table>
        </section>
      )}
    </div>
  )
}
