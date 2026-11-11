/** Vérifications périodiques du bâtiment : échéancier, saisie et alertes. */
import { useState } from 'react'
import { date, type Verification } from '../../donnees'
import { ecrire, supprimer } from '../../ecriture'
import { nouvelId } from '../../ids'
import { CATALOGUE, echeance, prochaine } from '../../verifications'
import { Champ, Dialogue, executer, lireNombre } from '../../composants/Ui'
import { useFiche } from './contexte'

const ETIQUETTE = { retard: 'En retard', proche: 'À prévoir', ok: 'À jour', inconnue: 'À renseigner' } as const

export default function Verifications() {
  const { ind, edition, modifier } = useFiche()
  const [ouverte, setOuverte] = useState<Verification | null>(null)
  const liste = ind.verifications.map((v) => ({ v, e: echeance(v) }))
    .sort((a, b) => (a.e.date ?? '9999').localeCompare(b.e.date ?? '9999') || a.v.type.localeCompare(b.v.type, 'fr'))
  const presents = new Set(ind.verifications.map((v) => v.type))

  const remplacer = (v: Verification | null, id: string) =>
    modifier((p) => ({ ...p, verifications: v ? [...p.verifications.filter((x) => x.id !== id), v] : p.verifications.filter((x) => x.id !== id) }))

  async function initialiser() {
    const manquants = CATALOGUE.filter((c) => !presents.has(c.type)).slice(0, 7)
    for (const c of manquants) {
      const v: Verification = { id: nouvelId(), projet_id: ind.projet.id, type: c.type, periodicite_mois: c.mois, organisme: null, derniere_date: null, prochaine_date: null, observations: null }
      const r = await executer(() => ecrire('releves', 'verification_periodique', { ...v, supprime_le: null }, { cle: { id: v.id } }))
      if (r) remplacer(r as unknown as Verification, v.id)
    }
  }

  return (
    <section className="carte">
      <div className="entete-carte">
        <h2>Vérifications périodiques</h2>
        {edition && <div className="boutons-ligne">
          {ind.verifications.length === 0 && <button className="bouton" onClick={initialiser}>Préremplir les vérifications courantes</button>}
          <button className="bouton" onClick={() => setOuverte({ id: '', projet_id: ind.projet.id, type: '', periodicite_mois: 12, organisme: null, derniere_date: null, prochaine_date: null, observations: null })}>+ Ajouter</button>
        </div>}
      </div>
      {liste.length === 0 ? <p className="vide">Aucune vérification enregistrée.{edition ? '' : ' Activez « Modification » pour en ajouter.'}</p> : (
        <table className="tableau">
          <thead><tr><th>Vérification</th><th>Organisme</th><th className="num">Périodicité</th><th>Dernière</th><th>Prochaine</th><th>État</th></tr></thead>
          <tbody>{liste.map(({ v, e }) => (
            <tr key={v.id} className={edition ? 'cliquable' : ''} onClick={() => edition && setOuverte(v)} title={v.observations ?? ''}>
              <td>{v.type}</td><td>{v.organisme || '—'}</td>
              <td className="num">{v.periodicite_mois ? `${v.periodicite_mois} mois` : '—'}</td>
              <td>{date(v.derniere_date)}</td><td>{date(e.date)}</td>
              <td><span className={`puce-ech ech-${e.etat}`}>{ETIQUETTE[e.etat]}{e.etat === 'retard' && e.jours != null ? ` (${-e.jours} j)` : e.etat === 'proche' && e.jours != null ? ` (${e.jours} j)` : ''}</span></td>
            </tr>))}
          </tbody>
        </table>
      )}
      {ouverte && <FicheVerification v={ouverte} fermer={() => setOuverte(null)} remplacer={remplacer} dejaPresents={presents} />}
    </section>
  )
}

function FicheVerification({ v, fermer, remplacer, dejaPresents }: {
  v: Verification; fermer: () => void; remplacer: (v: Verification | null, id: string) => void; dejaPresents: Set<string>
}) {
  const nouvelle = !v.id
  const [f, setF] = useState(v)
  const maj = (x: Partial<Verification>) => setF((a) => ({ ...a, ...x }))
  const catalogue = CATALOGUE.find((c) => c.type === f.type)
  const calculee = prochaine({ ...f, prochaine_date: null })

  async function valider() {
    if (!f.type.trim()) throw new Error('Indiquez le type de vérification.')
    const id = f.id || nouvelId()
    const ligne = { ...f, id, type: f.type.trim(), prochaine_date: f.prochaine_date || null, organisme: f.organisme?.trim() || null, observations: f.observations?.trim() || null }
    const { maj_le, ...sansMaj } = ligne
    const r = await executer(() => nouvelle
      ? ecrire('releves', 'verification_periodique', { ...sansMaj, supprime_le: null }, { cle: { id } })
      : ecrire('releves', 'verification_periodique', sansMaj, { cle: { id }, majLeConnue: maj_le ?? null }), 'Vérification enregistrée.')
    if (r) { remplacer(r as unknown as Verification, id); fermer() }
  }

  return (
    <Dialogue titre={nouvelle ? 'Nouvelle vérification périodique' : f.type} ouvert fermer={fermer} valider={valider}
      danger={nouvelle ? undefined : { libelle: 'Supprimer', action: async () => {
        if (!window.confirm(`Supprimer la vérification « ${v.type} » ?`)) return
        const r = await executer(() => supprimer('releves', 'verification_periodique', { id: v.id }, v.maj_le ?? null))
        if (r) { remplacer(null, v.id); fermer() }
      } }}>
      <div className="pile">
        <Champ libelle="Type de vérification" aide={catalogue?.note}>
          <input className="champ" list="catalogue-verifs" value={f.type} autoFocus={nouvelle}
            onChange={(e) => { const c = CATALOGUE.find((x) => x.type === e.target.value); maj({ type: e.target.value, ...(c && nouvelle ? { periodicite_mois: c.mois } : {}) }) }} />
          <datalist id="catalogue-verifs">{CATALOGUE.filter((c) => !dejaPresents.has(c.type) || c.type === v.type).map((c) => <option key={c.type} value={c.type} />)}</datalist>
        </Champ>
        <div className="deux-champs">
          <Champ libelle="Périodicité (mois)"><input className="champ" inputMode="numeric" value={f.periodicite_mois ?? ''} onChange={(e) => maj({ periodicite_mois: lireNombre(e.target.value) })} /></Champ>
          <Champ libelle="Organisme / prestataire"><input className="champ" value={f.organisme ?? ''} onChange={(e) => maj({ organisme: e.target.value })} /></Champ>
        </div>
        <div className="deux-champs">
          <Champ libelle="Dernière vérification"><input className="champ" type="date" value={f.derniere_date ?? ''} onChange={(e) => maj({ derniere_date: e.target.value || null })} /></Champ>
          <Champ libelle="Prochaine échéance" aide={calculee ? `Laissez vide pour retenir le ${date(calculee)} (dernière + périodicité).` : 'Calculée à partir de la dernière date et de la périodicité si laissée vide.'}>
            <input className="champ" type="date" value={f.prochaine_date ?? ''} onChange={(e) => maj({ prochaine_date: e.target.value || null })} />
          </Champ>
        </div>
        <Champ libelle="Observations" aide="Réserves du rapport, levées de réserves, n° de rapport…">
          <textarea className="champ" rows={3} value={f.observations ?? ''} onChange={(e) => maj({ observations: e.target.value })} />
        </Champ>
      </div>
    </Dialogue>
  )
}
