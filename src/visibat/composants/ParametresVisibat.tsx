import { useCallback, useEffect, useState } from 'react'
import { ModelesExe } from './ModelesExe'
import { enregistrer, lireAffectations, lireAgents, lireDirections, lireGroupes, lireStatuts, modifier, supprimer, type Affectation, type Agent, type Direction, type Groupe, type GroupeMembre, type Statut } from '../donnees'
import { executer } from '../../composants/Ui'
import { EtiquetteStatut, Logo } from '../ui'

/** Onglet « Visibat » de la fenêtre Paramètres de Batiscope : statuts des observations, groupes, directions. */
export default function ParametresVisibat({ moiId, admin }: { moiId: string; admin: boolean }) {
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [groupes, setGroupes] = useState<{ groupes: Groupe[]; membres: GroupeMembre[] }>({ groupes: [], membres: [] })
  const [agents, setAgents] = useState<Agent[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [affectations, setAffectations] = useState<Affectation[]>([])
  const [nomGroupe, setNomGroupe] = useState('')
  const charger = useCallback(async () => {
    const [s, g, a, d, af] = await Promise.all([lireStatuts(), lireGroupes(), lireAgents(), lireDirections(), lireAffectations()])
    setStatuts(s); setGroupes(g); setAgents(a); setDirections(d); setAffectations(af)
  }, [])
  const maDirection = directions.find((d) => d.id === affectations.find((x) => x.agent_id === moiId)?.direction_id) ?? directions[0]
  /** Rattache un agent à une direction (une seule par agent). */
  const affecter = (agentId: string, directionId: string) => {
    const ex = affectations.find((x) => x.agent_id === agentId)
    return action(() => ex ? modifier('affectation', ex.id, { direction_id: directionId }) : enregistrer('affectation', { agent_id: agentId, direction_id: directionId }), 'Direction enregistrée')
  }
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
        const d = directions.length > 1 ? directions.find((x) => x.id === g.direction_id) : undefined
        return (
          <div key={g.id} className="carte" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {d && <span className="etiquette" title={d.nom}>{d.sigle}</span>}
            <strong>{g.nom}</strong>
            <span className="note-param" style={{ flex: 1 }}>{ms.map((m) => agents.find((a) => a.id === m.agent_id)?.nom ?? '?').join(', ') || 'Aucun membre'}</span>
            {moi
              ? <button type="button" className="bouton petit" onClick={() => action(() => supprimer('groupe_membre', moi.id), 'Vous avez quitté le groupe')}>Quitter</button>
              : <button type="button" className="bouton petit" onClick={() => action(() => enregistrer('groupe_membre', { groupe_id: g.id, agent_id: moiId }), 'Vous avez rejoint le groupe')}>Rejoindre</button>}
          </div>)
      })}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="champ" style={{ flex: 1 }} placeholder={`Nouveau groupe (ex. ${maDirection?.sigle ?? 'DETB'} Ouest)`} aria-label="Nom du nouveau groupe" value={nomGroupe} onChange={(e) => setNomGroupe(e.target.value)} />
        <button type="button" className="bouton" onClick={() => {
          const nom = nomGroupe.trim(); if (!nom) return
          action(async () => { const g = await enregistrer('groupe', { nom, direction_id: maDirection?.id ?? null }); await enregistrer('groupe_membre', { groupe_id: g.id, agent_id: moiId }) }, 'Groupe créé')
          setNomGroupe('')
        }}>Créer le groupe</button>
      </div>

      <h3 style={{ margin: '8px 0 0' }}>Mes coordonnées</h3>
      <label className="pile" style={{ gap: 2, maxWidth: 320 }}><span className="note-param">Mon téléphone (« Affaire suivie par » dans les formulaires EXE)</span>
        <input className="champ petit" type="tel" defaultValue={affectations.find((x) => x.agent_id === moiId)?.telephone ?? ''} onBlur={(e) => {
          const ex = affectations.find((x) => x.agent_id === moiId)
          const v = e.target.value.trim() || null
          if (v === (ex?.telephone ?? null)) return
          action(() => ex ? modifier('affectation', ex.id, { telephone: v }) : enregistrer('affectation', { agent_id: moiId, direction_id: maDirection?.id, telephone: v }), 'Téléphone enregistré')
        }} /></label>

      <ModelesExe admin={admin} />

      <h3 style={{ margin: '8px 0 0' }}>Directions</h3>
      <p className="note-param">Chaque direction a son en-tête sur les comptes rendus. Tous les agents voient et modifient tous les chantiers, quelle que soit leur direction.
        {!admin && ' Modification réservée aux administrateurs.'}</p>
      {directions.map((d) => (
        <div key={d.id} className="carte pile" style={{ padding: '10px 14px', gap: 8 }}>
          <div className="grille-2">
            <label className="pile" style={{ gap: 2 }}><span className="note-param">Sigle</span>
              <input className="champ petit" defaultValue={d.sigle} disabled={!admin} onBlur={(e) => e.target.value.trim() && e.target.value !== d.sigle && action(() => modifier('direction', d.id, { sigle: e.target.value.trim() }), 'Direction enregistrée')} /></label>
            <label className="pile" style={{ gap: 2 }}><span className="note-param">Nom complet (en-tête du CR)</span>
              <input className="champ petit" defaultValue={d.nom} disabled={!admin} onBlur={(e) => e.target.value.trim() && e.target.value !== d.nom && action(() => modifier('direction', d.id, { nom: e.target.value.trim() }), 'Direction enregistrée')} /></label>
            <label className="pile" style={{ gap: 2 }}><span className="note-param">Pôle (sous le nom)</span>
              <input className="champ petit" defaultValue={d.pole ?? ''} disabled={!admin} onBlur={(e) => e.target.value !== (d.pole ?? '') && action(() => modifier('direction', d.id, { pole: e.target.value.trim() || null }), 'Direction enregistrée')} /></label>
            <label className="pile" style={{ gap: 2 }}><span className="note-param">Pied de page (adresse, téléphone…)</span>
              <input className="champ petit" defaultValue={d.pied ?? ''} disabled={!admin} onBlur={(e) => e.target.value !== (d.pied ?? '') && action(() => modifier('direction', d.id, { pied: e.target.value.trim() || null }), 'Direction enregistrée')} /></label>
            <label className="pile" style={{ gap: 2 }}><span className="note-param">Adresse (formulaires EXE)</span>
              <input className="champ petit" defaultValue={d.adresse ?? ''} disabled={!admin} placeholder="ex. 10 place Napoléon" onBlur={(e) => e.target.value !== (d.adresse ?? '') && action(() => modifier('direction', d.id, { adresse: e.target.value.trim() || null }), 'Direction enregistrée')} /></label>
            <label className="pile" style={{ gap: 2 }}><span className="note-param">Code postal (formulaires EXE)</span>
              <input className="champ petit" defaultValue={d.code_postal ?? ''} disabled={!admin} placeholder="50100" onBlur={(e) => e.target.value !== (d.code_postal ?? '') && action(() => modifier('direction', d.id, { code_postal: e.target.value.trim() || null }), 'Direction enregistrée')} /></label>
          </div>
          <span className="note-param">{affectations.filter((x) => x.direction_id === d.id).length} agent(s)</span>
        </div>))}
      {admin && <button type="button" className="bouton" style={{ alignSelf: 'flex-start' }} onClick={() => {
        const sigle = window.prompt('Sigle de la nouvelle direction (ex. DSL) :')?.trim(); if (!sigle) return
        const nom = window.prompt('Nom complet (ex. Direction des Sports et Loisirs) :')?.trim() || sigle
        action(() => enregistrer('direction', { sigle, nom, ordre: directions.length + 1 }), 'Direction créée')
      }}>+ Nouvelle direction</button>}

      {admin && directions.length > 0 && <>
        <h3 style={{ margin: '8px 0 0' }}>Direction de chaque agent</h3>
        <div className="tableau-conteneur"><table className="tableau">
          <thead><tr><th>Agent</th><th>Accès</th><th>Direction</th></tr></thead>
          <tbody>{agents.filter((a) => a.actif).map((a) => (
            <tr key={a.id}>
              <td>{a.nom}</td>
              <td>{a.role === 'visibat' ? 'Visibat uniquement' : a.role === 'admin' ? 'Administrateur' : a.role === 'tablette' ? 'Tablette' : 'Complet'}</td>
              <td><select className="champ petit" aria-label={`Direction de ${a.nom}`} value={affectations.find((x) => x.agent_id === a.id)?.direction_id ?? ''}
                onChange={(e) => e.target.value && affecter(a.id, e.target.value)}>
                <option value="">—</option>
                {directions.map((d) => <option key={d.id} value={d.id}>{d.sigle}</option>)}
              </select></td>
            </tr>))}
          </tbody>
        </table></div>
      </>}
    </div>
  )
}
