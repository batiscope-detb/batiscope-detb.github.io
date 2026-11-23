import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { statutDe, useVisibat } from '../contexte'
import { enregistrer, modifier, type Dossier, type Observation, type Reunion } from '../donnees'
import { ETATS, ORDRE_CATEGORIES, cumulAbsences, enRetard, etatSuivant, libelleType, penaliteAbsences, type Etat } from '../regles'
import { observationsVisibles, rubriques } from '../organisation'
import { useDossier } from '../useDossier'
import FicheObservation from '../composants/FicheObservation'
import { nomComplet } from '../composants/FicheContact'
import { Champ, executer } from '../../composants/Ui'
import Entete, { Onglets } from '../composants/Entete'
import { EtiquetteStatut, aujourdhui, dateFr, dateHeureFr, depuisSaisie, versSaisie } from '../ui'
import { useUrls, urlPhoto } from '../useUrls'
import { PlanReunion } from '../composants/Plans'
import Export from '../composants/Export'

type Onglet = 'presences' | 'observations' | 'plan' | 'cloture'

export default function PageReunion() {
  const { id, reunionId } = useParams()
  const { dossier, erreur, recharger } = useDossier(id)
  const [onglet, setOnglet] = useState<Onglet>('observations')
  const urls = useUrls(dossier)
  if (erreur) return <main className="page"><p className="erreur">{erreur}</p></main>
  if (!dossier) return <div className="chargement"><span className="roue" />Chargement…</div>
  const reunion = dossier.reunions.find((r) => r.id === reunionId)
  if (!reunion) return <main className="page"><p className="erreur">Réunion introuvable.</p></main>
  const op = dossier.operation
  return (
    <main className="page">
      <Entete fil={[{ lien: `/visibat/operation/${op.id}`, libelle: op.nom }]} titre={`Réunion de chantier n° ${reunion.numero}`}
        sousTitre={`${dateHeureFr(reunion.date_reunion)} · ${reunion.lieu ?? ''}${reunion.prochaine_date ? ` · prochaine réunion : ${dateHeureFr(reunion.prochaine_date)}` : ''}`} />
      <Onglets valeur={onglet} changer={setOnglet} choix={[['presences', 'Présences'], ['observations', 'Observations'], ['plan', 'Plans'], ['cloture', 'Export & diffusion']]} />
      {onglet === 'presences' && <Presences dossier={dossier} reunion={reunion} recharger={recharger} />}
      {(onglet === 'observations' || onglet === 'plan') && <Observations dossier={dossier} reunion={reunion} recharger={recharger} urls={urls} surPlan={onglet === 'plan'} />}
      {onglet === 'cloture' && <Cloture dossier={dossier} reunion={reunion} recharger={recharger} urls={urls} />}
    </main>
  )
}

function Presences({ dossier, reunion, recharger }: { dossier: Dossier; reunion: Reunion; recharger: () => Promise<void> }) {
  const { contacts } = useVisibat()
  const montant = dossier.operation.penalite_absence
  const presence = (i: string) => dossier.presences.find((p) => p.reunion_id === reunion.id && p.intervenant_id === i)

  async function changer(intervenantId: string, champs: { etat?: Etat | null; convoque?: boolean }) {
    const ok = await executer(async () => {
      const p = presence(intervenantId)
      if (p) await modifier('presence', p.id, champs)
      else await enregistrer('presence', { reunion_id: reunion.id, intervenant_id: intervenantId, etat: null, convoque: true, ...champs })
      return true
    })
    if (ok) await recharger()
  }

  const alertes = dossier.intervenants.map((i) => ({ i, n: cumulAbsences(dossier.presences, i.id, dossier.reunions, reunion.numero) })).filter((x) => x.n >= 2)
  const groupes = ORDRE_CATEGORIES.map((cat) => ({ cat, liste: dossier.intervenants.filter((i) => i.categorie === cat) })).filter((g) => g.liste.length)
  if (!dossier.intervenants.length) return <p className="vide">Ajoutez d’abord les intervenants dans l’opération (onglet « Intervenants »).</p>
  return <>
    <div className="vb-puces vb-discret">Toucher l’état pour le changer :
      {ETATS.map((e) => <span key={e.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
        <span className="vb-etat petit" style={{ background: e.couleur }}>{e.code}</span>{e.libelle}</span>)}
    </div>
    {alertes.length > 0 && <div className="vb-alerte" role="status">
      <strong>Absences répétées :</strong> {alertes.map(({ i, n }) => {
        const c = contacts.find((x) => x.id === i.contact_id)
        return `${c?.societe ?? nomComplet(c)} (${n} absences${montant ? `, soit ${penaliteAbsences(n, montant)} € HT` : ''})`
      }).join(' · ')}{montant ? ` — pénalité CCAP : ${montant} € HT par absence.` : ''}
    </div>}
    {groupes.map((g) => (
      <section key={g.cat} className="vb-rubrique">
        <header><h2>{libelleType(g.cat)}</h2></header>
        <div className="carte tableau-conteneur"><table className="tableau">
          <thead><tr><th>Intervenant</th><th>Société</th><th>État</th><th>Convoqué à la prochaine</th><th style={{ textAlign: 'right' }}>Absences</th></tr></thead>
          <tbody>{g.liste.map((i) => {
            const c = contacts.find((x) => x.id === i.contact_id)
            const p = presence(i.id)
            const e = ETATS.find((x) => x.code === p?.etat)
            const n = cumulAbsences(dossier.presences, i.id, dossier.reunions, reunion.numero)
            const lot = dossier.lots.find((l) => l.id === i.lot_id)
            return (
              <tr key={i.id}>
                <td>{lot && <div className="vb-discret">{lot.code} {lot.libelle}</div>}<strong>{nomComplet(c)}</strong>{c?.fonction && <div className="vb-discret">{c.fonction}</div>}</td>
                <td>{c?.societe}</td>
                <td><button type="button" className="vb-etat" style={{ background: e?.couleur }} aria-label={`${nomComplet(c)} : ${e?.libelle ?? 'non renseigné'}, toucher pour changer`}
                  onClick={() => changer(i.id, { etat: etatSuivant((p?.etat as Etat) ?? null) })}>{p?.etat ?? '–'}</button></td>
                <td><label className="case"><input type="checkbox" checked={p?.convoque ?? i.convoque_defaut} onChange={(ev) => changer(i.id, { convoque: ev.target.checked })} />Convoqué</label></td>
                <td style={{ textAlign: 'right' }}><span style={n >= 2 ? { background: '#8c1d18', color: '#fff', borderRadius: 12, padding: '3px 10px', fontWeight: 700 } : { fontWeight: 600 }}>{n}</span></td>
              </tr>)
          })}</tbody>
        </table></div>
      </section>))}
  </>
}

function Observations({ dossier, reunion, recharger, urls, surPlan }: { dossier: Dossier; reunion: Reunion; recharger: () => Promise<void>; urls: Map<string, string>; surPlan: boolean }) {
  const { statuts, contacts } = useVisibat()
  const [filtre, setFiltre] = useState('tous')
  const [fiche, setFiche] = useState<{ o: Observation | null; lot?: string; position?: { planId: string; x: number; y: number } } | null>(null)
  const visibles = useMemo(() => observationsVisibles(dossier, reunion, statuts), [dossier, reunion, statuts])
  const filtrees = visibles.filter((o) => filtre === 'tous' || o.statut_code === filtre)
  const groupes = rubriques(dossier, filtrees, contacts).filter((g) => g.observations.length > 0 || (filtre === 'tous' && g.lotId))
  const nb = (code: string) => code === 'tous' ? visibles.length : visibles.filter((o) => o.statut_code === code).length
  const auj = aujourdhui()

  const ficheDialogue = <FicheObservation dossier={dossier} reunion={reunion} observation={fiche?.o ?? null} lotParDefaut={fiche?.lot} position={fiche?.position}
    urls={urls} ouvert={!!fiche} fermer={() => setFiche(null)} recharger={recharger} />
  if (surPlan) return <>
    <PlanReunion dossier={dossier} observations={visibles} urls={urls} recharger={recharger}
      poser={(planId, x, y) => setFiche({ o: null, position: { planId, x, y } })} ouvrir={(o) => setFiche({ o })} />
    {ficheDialogue}
  </>
  return <>
    <div className="vb-barre">
      <button type="button" className="bouton primaire" onClick={() => setFiche({ o: null })}>+ Observation</button>
      <div className="vb-puces" role="group" aria-label="Filtrer par statut">
        <button type="button" className="vb-puce" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>Toutes · {nb('tous')}</button>
        {statuts.map((s) => <button key={s.code} type="button" className="vb-puce" aria-pressed={filtre === s.code} onClick={() => setFiltre(s.code)}
          style={filtre === s.code ? { background: s.couleur, borderColor: s.couleur } : undefined}>{s.libelle} · {nb(s.code)}</button>)}
      </div>
    </div>
    {groupes.map((g) => (
      <section key={g.cle} className="vb-rubrique">
        <header>
          <h2>{g.titre}</h2>{g.sousTitre && <span className="vb-discret">{g.sousTitre}</span>}
          {g.lotId && <button type="button" className="bouton petit" onClick={() => setFiche({ o: null, lot: g.lotId })}>+ dans ce lot</button>}
        </header>
        {g.observations.map((o) => {
          const s = statutDe(statuts, o.statut_code)
          const charge = dossier.intervenants.find((i) => i.id === o.a_charge_de)
          const c = contacts.find((x) => x.id === charge?.contact_id)
          const retard = enRetard(o.echeance, !!s?.soldant, auj)
          const nbCheck = dossier.checklists.filter((x) => x.observation_id === o.id)
          const photos = dossier.photos.filter((x) => x.observation_id === o.id)
          const surLePlan = dossier.positions.some((x) => x.observation_id === o.id)
          return (
            <button key={`${g.cle}-${o.id}`} type="button" className="vb-obs" style={{ ['--couleur' as string]: s?.couleur ?? '#999' }} onClick={() => setFiche({ o })}>
              <span className="vb-ligne">
                <span className="vb-numero">{o.numero}</span><EtiquetteStatut statut={s} />
                <span className="vb-discret">{o.date_statut ? `depuis le ${dateFr(o.date_statut)}` : ''}{o.cree_le ? `, créée le ${dateFr(o.cree_le)}` : ''}</span>
                {o.reunion_id !== reunion.id && o.reunion_id && <span className="etiquette" style={{ background: 'var(--pale)', color: 'var(--violet)' }}>Reportée</span>}
                <span className="vb-discret" style={{ marginLeft: 'auto' }}>
                  {[nbCheck.length ? `☑ ${nbCheck.filter((x) => x.fait).length}/${nbCheck.length}` : '', photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : '', surLePlan ? 'sur plan' : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="vb-texte">{o.texte}</span>
              {photos.length > 0 && <span className="vb-vignettes">{photos.slice(0, 4).map((p) => { const u = urlPhoto(urls, p.storage_path); return u ? <img key={p.id} src={u} alt="" loading="lazy" /> : null })}</span>}
              {(charge || o.echeance || o.date_intervention) && <span className="vb-discret">
                {charge && <>À charge de : <strong>{c?.societe ?? nomComplet(c)}</strong> </>}
                {o.echeance && <> · Échéance : <span className={retard ? 'vb-retard' : ''}>{dateFr(o.echeance)}{retard ? ' (dépassée)' : ''}</span></>}
                {o.date_intervention && <> · Programmée le {dateFr(o.date_intervention)}</>}
              </span>}
            </button>)
        })}
        {g.observations.length === 0 && <p className="vb-discret" style={{ margin: 0 }}>Aucune observation.</p>}
      </section>))}
    {ficheDialogue}
  </>
}

function Cloture({ dossier, reunion, recharger, urls }: { dossier: Dossier; reunion: Reunion; recharger: () => Promise<void>; urls: Map<string, string> }) {
  const maj = async (champs: Record<string, unknown>) => { if (await executer(() => modifier('reunion', reunion.id, champs).then(() => true), 'Enregistré')) await recharger() }
  return <>
    <section className="carte pile" style={{ maxWidth: 980 }}>
      <h2 style={{ margin: 0 }}>Prochaine réunion</h2>
      <div className="grille-2">
        <Champ libelle="Date et heure"><input className="champ" type="datetime-local" defaultValue={versSaisie(reunion.prochaine_date)} onBlur={(e) => maj({ prochaine_date: depuisSaisie(e.target.value) })} /></Champ>
        <Champ libelle="Lieu"><input className="champ" defaultValue={reunion.prochaine_lieu ?? reunion.lieu ?? ''} onBlur={(e) => maj({ prochaine_lieu: e.target.value || null })} /></Champ>
      </div>
      <div className="vb-barre">
        {reunion.statut === 'brouillon' && <button type="button" className="bouton" onClick={() => maj({ statut: 'cloturee' })}>Clôturer la réunion</button>}
        {reunion.statut !== 'brouillon' && <button type="button" className="bouton" onClick={() => maj({ statut: 'brouillon', diffusee_le: null })}>Rouvrir la réunion</button>}
      </div>
    </section>
    <Export dossier={dossier} reunion={reunion} urls={urls} recharger={recharger} />
  </>
}
