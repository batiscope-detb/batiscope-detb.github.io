import { useCallback, useEffect, useState } from 'react'
import { enregistrer, lireAgents, lireGroupes, lireStatuts, modifier, supprimer, type Agent, type Groupe, type GroupeMembre, type Statut } from '../donnees'
import { executer } from '../../composants/Ui'
import { EtiquetteStatut, Logo } from '../ui'

/** Onglet « Visibat » de la fenêtre Paramètres de Batiscope : statuts des observations et groupes. */
export default function ParametresVisibat({ moiId, admin }: { moiId: string; admin: boolean }) {
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [groupes, setGroupes] = useState<{ groupes: Groupe[]; membres: GroupeMembre[] }>({ groupes: [], membres: [] })
  const [agents, setAgents] = useState<Agent[]>([])
  const [nomGroupe, setNomGroupe] = useState('')
  const charger = useCallback(async () => {
    const [s, g, a] = await Promise.all([lireStatuts(), lireGroupes(), lireAgents()])
    setStatuts(s); setGroupes(g); setAgents(a)
  }, [])
  useEffect(() => { executer(charger) }, [charger])
  const action = async (f: () => Promise<unknown>, ok?: string) => { if (await executer(async () => { await f(); return true }, ok)) await charger() }

  return (
    <div className="pile">
      <p className="note-param" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Logo taille={26} /> Visites et comptes rendus de chantier.</p>
      <h3 style={{ margin: 0 }}>Statuts des observations</h3>
      <p className="note-param">Un statut « reporté » fait revenir l’observation dans chaque CR jusqu’à ce qu’elle soit soldée.{!admin && ' Modification réservée aux administrateurs.'}</p>
      <div className="tableau-conteneur"><table className="tableau">
        <thead><tr><th>Aperçu</th><th>Libellé</th><th>Couleur</th><th>Report au CR suivant</th></tr></thead>
        <tbody>{statuts.map((s) => (
          <tr key={s.id}>
            <td><EtiquetteStatut statut={s} /></td>
            <td><input className="champ petit" defaultValue={s.libelle} disabled={!admin} aria-label={`Libellé du statut ${s.libelle}`}
              onBlur={(e) => e.target.value.trim() && e.target.value !== s.libelle && action(() => modifier('statut', s.id, { libelle: e.target.value.trim() }), 'Statut enregistré')} /></td>
            <td><input type="color" defaultValue={s.couleur} disabled={!admin} aria-label={`Couleur du statut ${s.libelle}`}
              onBlur={(e) => e.target.value !== s.couleur && action(() => modifier('statut', s.id, { couleur: e.target.value }), 'Couleur enregistrée')} /></td>
            <td>{s.soldant ? 'Non (clôt l’observation)' : s.reporte ? 'Oui' : 'Non'}</td>
          </tr>))}
        </tbody>
      </table></div>

      <h3 style={{ margin: '8px 0 0' }}>Groupes</h3>
      <p className="note-param">Une opération rattachée à un groupe apparaît dans « Projets du groupe » pour tous ses membres ; sans groupe, elle reste dans « Mes projets ».</p>
      {groupes.groupes.map((g) => {
        const ms = groupes.membres.filter((m) => m.groupe_id === g.id)
        const moi = ms.find((m) => m.agent_id === moiId)
        return (
          <div key={g.id} className="carte" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{g.nom}</strong>
            <span className="note-param" style={{ flex: 1 }}>{ms.map((m) => agents.find((a) => a.id === m.agent_id)?.nom ?? '?').join(', ') || 'Aucun membre'}</span>
            {moi
              ? <button type="button" className="bouton petit" onClick={() => action(() => supprimer('groupe_membre', moi.id), 'Vous avez quitté le groupe')}>Quitter</button>
              : <button type="button" className="bouton petit" onClick={() => action(() => enregistrer('groupe_membre', { groupe_id: g.id, agent_id: moiId }), 'Vous avez rejoint le groupe')}>Rejoindre</button>}
          </div>)
      })}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="champ" style={{ flex: 1 }} placeholder="Nouveau groupe (ex. DETB Ouest)" aria-label="Nom du nouveau groupe" value={nomGroupe} onChange={(e) => setNomGroupe(e.target.value)} />
        <button type="button" className="bouton" onClick={() => {
          const nom = nomGroupe.trim(); if (!nom) return
          action(async () => { const g = await enregistrer('groupe', { nom }); await enregistrer('groupe_membre', { groupe_id: g.id, agent_id: moiId }) }, 'Groupe créé')
          setNomGroupe('')
        }}>Créer le groupe</button>
      </div>
    </div>
  )
}
