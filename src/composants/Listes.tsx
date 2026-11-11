/** Listes de référence gérées par les administrateurs : corps d'état, points de contrôle, types de locaux. */
import { useState } from 'react'
import { useDonnees } from '../App'
import { supabase, type Lot, type Patrimoine, type PointControle, type TypeLocal } from '../donnees'
import { ecrire, supprimer } from '../ecriture'
import { nouvelId } from '../ids'
import { executer, signaler } from './Ui'

type Sous = 'lots' | 'types'
const maintenantIso = () => new Date().toISOString()

export function Listes() {
  const { donnees, modifier } = useDonnees()
  const [sous, setSous] = useState<Sous>('lots')
  const [lotChoisi, setLotChoisi] = useState<string | null>(null)
  const [voirArchives, setVoirArchives] = useState(false)
  if (!donnees) return null
  const p = donnees.patrimoine
  const lots = p.lots.slice().sort((a, b) => a.ordre - b.ordre).filter((l) => voirArchives || !l.archive_le)
  const lot = p.lots.find((l) => l.id === lotChoisi) ?? lots[0]
  const points = p.points.filter((x) => x.lot_id === lot?.id).sort((a, b) => a.ordre - b.ordre).filter((x) => voirArchives || !x.obsolete)
  const types = p.typesLocaux.slice().sort((a, b) => a.ordre - b.ordre)
  const usageLot = (id: string) => p.constats.filter((c) => c.lot_id === id).length
  const usageType = (libelle: string) => p.locaux.filter((l) => l.type === libelle).length

  /** Écrit une ligne et reporte le résultat dans les données affichées. */
  async function enreg<T extends { id: string }>(table: 'lot' | 'point_controle' | 'type_local', cle: 'lots' | 'points' | 'typesLocaux', ligne: Partial<T> & { id: string }, creation = false) {
    const r = await executer(() => ecrire('releves', table, creation ? { ...ligne, supprime_le: null } : ligne, creation ? { cle: { id: ligne.id } } : { cle: { id: ligne.id }, majLeConnue: null }))
    if (!r) return false
    modifier((x: Patrimoine) => {
      const liste = x[cle] as unknown as T[]
      const nouvelle = liste.some((e) => e.id === ligne.id) ? liste.map((e) => (e.id === ligne.id ? { ...e, ...ligne } : e)) : [...liste, r as unknown as T]
      return { ...x, [cle]: nouvelle }
    })
    return true
  }
  async function retirer(table: 'lot' | 'point_controle' | 'type_local', cle: 'lots' | 'points' | 'typesLocaux', id: string, libelle: string) {
    if (!window.confirm(`Supprimer définitivement « ${libelle} » de la liste ?`)) return
    const r = await executer(() => supprimer('releves', table, { id }), 'Supprimé de la liste')
    if (r) modifier((x: Patrimoine) => ({ ...x, [cle]: (x[cle] as unknown as { id: string }[]).filter((e) => e.id !== id) }))
  }
  /** Échange l'ordre de deux éléments voisins. */
  async function deplacer<T extends { id: string; ordre: number }>(table: 'lot' | 'point_controle' | 'type_local', cle: 'lots' | 'points' | 'typesLocaux', liste: T[], i: number, sens: -1 | 1) {
    const a = liste[i], b = liste[i + sens]
    if (!a || !b) return
    const oa = a.ordre === b.ordre ? a.ordre + sens : b.ordre
    await enreg<T>(table, cle, { id: a.id, ordre: oa } as Partial<T> & { id: string })
    await enreg<T>(table, cle, { id: b.id, ordre: a.ordre } as Partial<T> & { id: string })
  }
  const renommer = <T extends { id: string; libelle: string }>(table: 'lot' | 'point_controle' | 'type_local', cle: 'lots' | 'points' | 'typesLocaux', e: T, v: string) => {
    const t = v.trim()
    if (!t || t === e.libelle) return
    enreg<T>(table, cle, { id: e.id, libelle: t } as Partial<T> & { id: string }).then((ok) => ok && signaler('Libellé modifié'))
  }
  const prochainOrdre = (l: { ordre: number }[]) => Math.max(0, ...l.map((x) => x.ordre)) + 1

  const fleches = (onHaut: () => void, onBas: () => void, i: number, n: number) => (
    <span className="fleches">
      <button type="button" className="bouton petit" disabled={i === 0} onClick={onHaut} aria-label="Monter">▲</button>
      <button type="button" className="bouton petit" disabled={i === n - 1} onClick={onBas} aria-label="Descendre">▼</button>
    </span>
  )

  return (
    <div className="pile">
      <div className="choix-ligne">
        <label className="case"><input type="radio" name="sous-liste" checked={sous === 'lots'} onChange={() => setSous('lots')} /> Corps d'état et points de contrôle</label>
        <label className="case"><input type="radio" name="sous-liste" checked={sous === 'types'} onChange={() => setSous('types')} /> Types de locaux</label>
      </div>
      {sous === 'lots' && (
        <>
          <label className="case"><input type="checkbox" checked={voirArchives} onChange={(e) => setVoirArchives(e.target.checked)} /> Afficher aussi les éléments archivés</label>
          <div className="listes-deux">
            <div>
              <h3>Corps d'état</h3>
              <ul className="liste-ref">
                {lots.map((l, i) => (
                  <li key={l.id} className={`${l.id === lot?.id ? 'choisi' : ''}${l.archive_le ? ' archive' : ''}`} onClick={() => setLotChoisi(l.id)}>
                    <input className="champ petit" defaultValue={l.libelle} key={l.libelle} onBlur={(e) => renommer<Lot>('lot', 'lots', l, e.target.value)} aria-label="Libellé du corps d'état" />
                    <small>{usageLot(l.id)} constat(s)</small>
                    {fleches(() => deplacer<Lot>('lot', 'lots', lots, i, -1), () => deplacer<Lot>('lot', 'lots', lots, i, 1), i, lots.length)}
                    <button type="button" className="bouton petit" onClick={() => enreg<Lot>('lot', 'lots', { id: l.id, archive_le: l.archive_le ? null : maintenantIso() })}>{l.archive_le ? 'Réactiver' : 'Archiver'}</button>
                    {usageLot(l.id) === 0 && p.points.every((x) => x.lot_id !== l.id) && <button type="button" className="bouton petit danger" onClick={() => retirer('lot', 'lots', l.id, l.libelle)}>Supprimer</button>}
                  </li>
                ))}
              </ul>
              <button type="button" className="bouton" onClick={() => { const id = nouvelId(); enreg<Lot>('lot', 'lots', { id, libelle: 'Nouveau corps d\'état', ordre: prochainOrdre(p.lots), archive_le: null }, true).then((ok) => ok && setLotChoisi(id)) }}>+ Corps d'état</button>
            </div>
            <div>
              <h3>Points de contrôle {lot ? `— ${lot.libelle}` : ''}</h3>
              {!lot ? <p className="vide">Choisissez un corps d'état.</p> : (
                <>
                  <ul className="liste-ref">
                    {points.length === 0 && <li className="vide">Aucun point de contrôle.</li>}
                    {points.map((x, i) => (
                      <li key={x.id} className={x.obsolete ? 'archive' : ''}>
                        <input className="champ petit" defaultValue={x.libelle} key={x.libelle} onBlur={(e) => renommer<PointControle>('point_controle', 'points', x, e.target.value)} aria-label="Libellé du point de contrôle" />
                        {fleches(() => deplacer<PointControle>('point_controle', 'points', points, i, -1), () => deplacer<PointControle>('point_controle', 'points', points, i, 1), i, points.length)}
                        <button type="button" className="bouton petit" onClick={() => enreg<PointControle>('point_controle', 'points', { id: x.id, obsolete: !x.obsolete })}>{x.obsolete ? 'Réactiver' : 'Archiver'}</button>
                        <button type="button" className="bouton petit danger" onClick={async () => {
                          const { count } = await supabase.schema('releves').from('constat_point_controle').select('constat_id', { count: 'exact', head: true }).eq('point_controle_id', x.id).is('supprime_le', null)
                          if (count) { signaler(`Point utilisé dans ${count} constat(s) : archivez-le plutôt que de le supprimer.`, 'erreur'); return }
                          retirer('point_controle', 'points', x.id, x.libelle)
                        }}>Supprimer</button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="bouton" onClick={() => enreg<PointControle>('point_controle', 'points', { id: nouvelId(), lot_id: lot.id, libelle: 'Nouveau point de contrôle', ordre: prochainOrdre(p.points.filter((x) => x.lot_id === lot.id)), obsolete: false }, true)}>+ Point de contrôle</button>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {sous === 'types' && (
        <div>
          <ul className="liste-ref">
            {types.map((t, i) => (
              <li key={t.id}>
                <input className="champ petit" defaultValue={t.libelle} key={t.libelle} onBlur={(e) => renommer<TypeLocal>('type_local', 'typesLocaux', t, e.target.value)} aria-label="Libellé du type de local" />
                <small>{usageType(t.libelle)} local(aux)</small>
                {fleches(() => deplacer<TypeLocal>('type_local', 'typesLocaux', types, i, -1), () => deplacer<TypeLocal>('type_local', 'typesLocaux', types, i, 1), i, types.length)}
                <button type="button" className="bouton petit danger" onClick={() => retirer('type_local', 'typesLocaux', t.id, t.libelle)}>Retirer</button>
              </li>
            ))}
          </ul>
          <button type="button" className="bouton" onClick={() => enreg<TypeLocal>('type_local', 'typesLocaux', { id: nouvelId(), libelle: 'Nouveau type', ordre: prochainOrdre(types) }, true)}>+ Type de local</button>
          <p className="note-param">Retirer ou renommer un type ne modifie pas les locaux déjà relevés : ils gardent leur libellé.</p>
        </div>
      )}
      <p className="note-param">Les modifications sont transmises aux tablettes à leur prochaine synchronisation. Un élément archivé n'est plus proposé à la saisie mais reste visible dans les relevés existants.</p>
    </div>
  )
}
