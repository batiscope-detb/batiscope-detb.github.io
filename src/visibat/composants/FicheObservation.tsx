import { useEffect, useState } from 'react'
import { statutDe, useVisibat } from '../contexte'
import { enregistrer, modifier, supprimer, type Dossier, type Observation, type Reunion } from '../donnees'
import { libelleType, prochainNumero } from '../regles'
import { nomComplet } from './FicheContact'
import { Dialogue, executer, signaler } from '../../composants/Ui'
import { aujourdhui, dateFr, fonce, pale } from '../ui'

interface Formulaire {
  texte: string; statut_code: string; rubrique: Observation['rubrique']; echeance: string; date_intervention: string
  a_charge_de: string; lots: string[]; intervenants: string[]; permanente: boolean
}

/** Saisie ou modification d'une observation (remarque) dans une réunion. */
export default function FicheObservation({ dossier, reunion, observation, ouvert, fermer, recharger, lotParDefaut }: {
  dossier: Dossier; reunion: Reunion; observation: Observation | null; ouvert: boolean; fermer: () => void
  recharger: () => Promise<void>; lotParDefaut?: string
}) {
  const { statuts, contacts, moi, agents } = useVisibat()
  const [f, setF] = useState<Formulaire | null>(null)
  const [nouvelleTache, setNouvelleTache] = useState('')
  const [commentaire, setCommentaire] = useState('')

  useEffect(() => {
    if (!ouvert) return
    const o = observation
    setF({
      texte: o?.texte ?? '', statut_code: o?.statut_code ?? 'nouvelle', rubrique: o?.rubrique ?? 'lot',
      echeance: o?.echeance ?? '', date_intervention: o?.date_intervention ?? '', a_charge_de: o?.a_charge_de ?? '',
      lots: o ? dossier.obsLots.filter((x) => x.observation_id === o.id).map((x) => x.lot_id) : lotParDefaut ? [lotParDefaut] : [],
      intervenants: o ? dossier.obsIntervenants.filter((x) => x.observation_id === o.id).map((x) => x.intervenant_id) : [],
      permanente: o ? o.reunion_id === null : false,
    })
    setNouvelleTache(''); setCommentaire('')
  }, [ouvert, observation, dossier, lotParDefaut])

  if (!f) return null
  const statut = statutDe(statuts, f.statut_code)
  const nomInterv = (id: string) => { const i = dossier.intervenants.find((x) => x.id === id); const c = contacts.find((x) => x.id === i?.contact_id); return `${nomComplet(c)}${c?.societe ? ` (${c.societe})` : ''}` }
  const basculer = (liste: string[], v: string) => liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]
  const checklist = observation ? dossier.checklists.filter((c) => c.observation_id === observation.id) : []
  const commentaires = observation ? dossier.commentaires.filter((c) => c.observation_id === observation.id) : []
  const historique = observation ? dossier.suivis.filter((s) => s.observation_id === observation.id)
    .map((s) => ({ s, r: dossier.reunions.find((r) => r.id === s.reunion_id) })).filter((x) => x.r).sort((a, b) => a.r!.numero - b.r!.numero) : []

  async function valider() {
    if (!f) return
    if (!f.texte.trim()) return signaler('La description est vide.', 'erreur')
    const fait = await executer(async () => {
      const soldant = !!statut?.soldant
      const numero = observation?.numero ?? (f.permanente
        ? prochainNumero(0, dossier.observations.map((o) => o.numero))
        : prochainNumero(reunion.numero, dossier.observations.map((o) => o.numero)))
      const statutChange = observation?.statut_code !== f.statut_code
      const o = await enregistrer<Partial<Observation>>('observation', {
        ...(observation ? { id: observation.id } : { operation_id: dossier.operation.id, reunion_id: f.permanente ? null : reunion.id, numero, ordre: dossier.observations.length }),
        texte: f.texte.trim(), statut_code: f.statut_code, rubrique: f.rubrique,
        echeance: f.echeance || null, date_intervention: f.date_intervention || null, a_charge_de: f.a_charge_de || null,
        date_statut: statutChange ? reunion.date_reunion.slice(0, 10) : observation?.date_statut ?? reunion.date_reunion.slice(0, 10),
        soldee_le: soldant ? (observation?.soldee_le ?? reunion.date_reunion.slice(0, 10)) : null,
      })
      // Liens lots / intervenants : on ajoute les nouveaux, on retire les décochés
      const sync = async (table: 'observation_lot' | 'observation_intervenant', col: 'lot_id' | 'intervenant_id', voulus: string[]) => {
        const existants = (table === 'observation_lot' ? dossier.obsLots : dossier.obsIntervenants).filter((x) => x.observation_id === o.id) as { id: string; lot_id?: string; intervenant_id?: string }[]
        for (const v of voulus) if (!existants.some((x) => x[col] === v)) await enregistrer(table, { observation_id: o.id, [col]: v })
        for (const x of existants) if (!voulus.includes(x[col]!)) await supprimer(table, x.id)
      }
      await sync('observation_lot', 'lot_id', f.lots)
      await sync('observation_intervenant', 'intervenant_id', f.intervenants)
      // État de l'observation à cette réunion (historique)
      const suivi = dossier.suivis.find((s) => s.observation_id === o.id && s.reunion_id === reunion.id)
      if (suivi) await modifier('observation_suivi', suivi.id, { statut_code: f.statut_code })
      else await enregistrer('observation_suivi', { observation_id: o.id, reunion_id: reunion.id, statut_code: f.statut_code })
      return observation ? 'Observation enregistrée' : `Observation ${numero} créée`
    })
    if (fait) { signaler(fait); await recharger(); fermer() }
  }

  async function ajouterTache() {
    if (!observation || !nouvelleTache.trim()) return
    await enregistrer('observation_checklist', { observation_id: observation.id, libelle: nouvelleTache.trim(), ordre: checklist.length })
    setNouvelleTache(''); await recharger()
  }
  async function ajouterCommentaire() {
    if (!observation || !commentaire.trim()) return
    await enregistrer('observation_commentaire', { observation_id: observation.id, agent_id: moi.id, texte: commentaire.trim() })
    setCommentaire(''); await recharger()
  }

  return (
    <Dialogue large titre={observation ? `Observation ${observation.numero}` : `Nouvelle observation · réunion n° ${reunion.numero}`} ouvert={ouvert} fermer={fermer}
      valider={valider} libelleValider="Valider"
      danger={observation ? { libelle: 'Supprimer', action: async () => {
        if (!confirm('Supprimer cette observation ? Elle disparaîtra de tous les CR.')) return
        if (await executer(() => supprimer('observation', observation.id).then(() => true), 'Observation supprimée')) { await recharger(); fermer() }
      } } : undefined}>
      <div className="pile">
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="vb-discret" style={{ fontWeight: 600, paddingBottom: 6 }}>Statut</legend>
        <div className="vb-puces">
          {statuts.map((s) => {
            const on = s.code === f.statut_code
            return <button key={s.code} type="button" className="vb-puce" aria-pressed={on} onClick={() => setF({ ...f, statut_code: s.code })}
              style={{ background: on ? s.couleur : pale(s.couleur), color: on ? '#fff' : fonce(s.couleur), borderColor: on ? s.couleur : 'transparent' }}>{s.libelle}</button>
          })}
        </div>
      </fieldset>
      <label className="champ-form"><span>Description</span>
        <textarea className="champ vb-description" rows={6} value={f.texte} onChange={(e) => setF({ ...f, texte: e.target.value })} placeholder="Décrire le constat, la demande, la décision… (la dictée du clavier fonctionne ici)" />
      </label>
      <div className="grille-2">
        <label className="champ-form">Classée dans
          <select className="champ" value={f.rubrique} onChange={(e) => setF({ ...f, rubrique: e.target.value as Observation['rubrique'] })}>
            <option value="lot">Les lots associés</option>
            <option value="intervenant">Les intervenants associés</option>
            <option value="generale">Remarques générales</option>
          </select>
        </label>
        <label className="champ-form">À charge de
          <select className="champ" value={f.a_charge_de} onChange={(e) => setF({ ...f, a_charge_de: e.target.value })}>
            <option value="">—</option>
            {dossier.intervenants.map((i) => <option key={i.id} value={i.id}>{nomInterv(i.id)}</option>)}
          </select>
        </label>
      </div>
      <div className="grille-2">
        <label className="champ-form">Échéance<input className="champ" type="date" value={f.echeance} onChange={(e) => setF({ ...f, echeance: e.target.value })} /></label>
        <label className="champ-form">Date d’intervention (programmée)<input className="champ" type="date" value={f.date_intervention} onChange={(e) => setF({ ...f, date_intervention: e.target.value })} /></label>
      </div>
      {dossier.lots.length > 0 && <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="vb-discret" style={{ fontWeight: 600, paddingBottom: 6 }}>Lots associés (l’observation apparaît sous chacun)</legend>
        <div className="vb-puces">{dossier.lots.map((l) => (
          <button key={l.id} type="button" className="vb-puce" aria-pressed={f.lots.includes(l.id)} onClick={() => setF({ ...f, lots: basculer(f.lots, l.id) })}>{l.code} {l.libelle}</button>))}
        </div>
      </fieldset>}
      {dossier.intervenants.length > 0 && <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="vb-discret" style={{ fontWeight: 600, paddingBottom: 6 }}>Intervenants associés</legend>
        <div className="vb-puces">{dossier.intervenants.filter((i) => i.categorie !== 'entreprise' || f.rubrique === 'intervenant' || f.intervenants.includes(i.id)).map((i) => (
          <button key={i.id} type="button" className="vb-puce" aria-pressed={f.intervenants.includes(i.id)} onClick={() => setF({ ...f, intervenants: basculer(f.intervenants, i.id) })}>
            {nomInterv(i.id)} · {libelleType(i.categorie)}</button>))}
        </div>
      </fieldset>}
      {!observation && <label className="case"><input type="checkbox" checked={f.permanente} onChange={(e) => setF({ ...f, permanente: e.target.checked })} />Point permanent (numéroté 0.x : marché, règles de chantier…)</label>}

      {observation && <>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="vb-discret" style={{ fontWeight: 600 }}>Checklist</div>
          {checklist.map((c) => (
            <label key={c.id} className="case"><input type="checkbox" checked={c.fait} onChange={async (e) => { await modifier('observation_checklist', c.id, { fait: e.target.checked }); await recharger() }} />{c.libelle}</label>))}
          <div className="vb-ajout">
            <input className="champ" placeholder="Ajouter un point à vérifier" aria-label="Nouveau point de checklist" value={nouvelleTache} onChange={(e) => setNouvelleTache(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), ajouterTache())} />
            <button type="button" className="bouton" onClick={ajouterTache}>Ajouter</button>
          </div>
        </section>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="vb-discret" style={{ fontWeight: 600 }}>Commentaires internes (non imprimés)</div>
          {commentaires.map((c) => (
            <div key={c.id} className="vb-commentaire">
              <strong>{agents.find((a) => a.id === c.agent_id)?.nom ?? '?'}</strong> · {dateFr(c.cree_le)} — {c.texte}</div>))}
          <div className="vb-ajout">
            <input className="champ" placeholder="Commentaire pour l’équipe" aria-label="Nouveau commentaire" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), ajouterCommentaire())} />
            <button type="button" className="bouton" onClick={ajouterCommentaire}>Envoyer</button>
          </div>
        </section>
        {historique.length > 0 && <section className="vb-discret">
          <div style={{ fontWeight: 600 }}>Historique</div>
          {historique.map(({ s, r }) => <div key={s.id}>CR {r!.numero} ({dateFr(r!.date_reunion)}) — {statutDe(statuts, s.statut_code)?.libelle ?? s.statut_code}</div>)}
          <div>Créée le {dateFr(observation.cree_le)}{observation.echeance && observation.echeance < aujourdhui() && !statut?.soldant ? ' · échéance dépassée' : ''}</div>
        </section>}
      </>}
      </div>
    </Dialogue>
  )
}
