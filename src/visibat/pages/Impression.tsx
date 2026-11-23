import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { statutDe, useVisibat } from '../contexte'
import { ORDRE_CATEGORIES, cumulAbsences, libelleType } from '../regles'
import { observationsVisibles, rubriques } from '../organisation'
import { useDossier } from '../useDossier'
import { nomComplet } from '../composants/FicheContact'
import { dateFr, dateHeureFr, fonce } from '../ui'
import { useUrls, urlPhoto, urlPlan } from '../useUrls'
import type { Repere } from '../../composants/Plan'

const Plan = lazy(() => import('../../composants/Plan').then((m) => ({ default: m.Plan })))

/** Aperçu du CR (modèle « complet ») à imprimer ou enregistrer en PDF depuis le navigateur. */
export default function Impression() {
  const { id, reunionId } = useParams()
  const { dossier, erreur } = useDossier(id)
  const { statuts, contacts, moi } = useVisibat()
  const [memoire, setMemoire] = useState(true)
  const [avecPhotos, setAvecPhotos] = useState(true)
  const [avecPlans, setAvecPlans] = useState(true)
  const urls = useUrls(dossier)
  const reunion = dossier?.reunions.find((r) => r.id === reunionId)
  const obs = useMemo(() => dossier && reunion ? observationsVisibles(dossier, reunion, statuts) : [], [dossier, reunion, statuts])
  if (erreur) return <main className="page"><p className="erreur">{erreur}</p></main>
  if (!dossier) return <div className="chargement"><span className="roue" />Chargement…</div>
  if (!reunion) return <main className="page"><p className="erreur">Réunion introuvable.</p></main>
  const op = dossier.operation
  const affichees = obs.filter((o) => memoire || o.statut_code !== 'memoire')
  const groupes = rubriques(dossier, affichees, contacts).filter((g) => g.observations.length)
  const presence = (i: string) => dossier.presences.find((p) => p.reunion_id === reunion.id && p.intervenant_id === i)
  const COUL: Record<string, string> = { P: '#2e7d4f', E: '#1d5fa8', A: '#c2560f', N: '#8c1d18' }

  return (
    <main className="page">
      <div className="vb-titre vb-ne-pas-imprimer">
        <div><div className="vb-fil"><Link to={`/visibat/operation/${op.id}/reunion/${reunion.id}`}>← Retour à la réunion</Link></div><h1>Aperçu du compte rendu</h1></div>
        <label className="case"><input type="checkbox" checked={memoire} onChange={(e) => setMemoire(e.target.checked)} />Points « pour mémoire »</label>
        <label className="case"><input type="checkbox" checked={avecPhotos} onChange={(e) => setAvecPhotos(e.target.checked)} />Photos</label>
        <label className="case"><input type="checkbox" checked={avecPlans} onChange={(e) => setAvecPlans(e.target.checked)} />Plans avec pastilles</label>
        <button type="button" className="bouton primaire" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button>
      </div>
      <article className="vb-feuille">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '2px solid #430742', paddingBottom: 8 }}>
          <div><h1>Réunion de chantier n° {reunion.numero}</h1><div>{dateHeureFr(reunion.date_reunion)} · {reunion.lieu}</div></div>
          <div style={{ textAlign: 'right' }}>
            <strong>Direction Études Travaux Bâtiments</strong><br />Ville de Cherbourg-en-Cotentin<br />Rédacteur : {moi.nom}
            {reunion.prochaine_date && <div style={{ color: '#b3261e', fontWeight: 700, marginTop: 4 }}>Prochaine réunion : {dateHeureFr(reunion.prochaine_date)}{reunion.prochaine_lieu ? ` – ${reunion.prochaine_lieu}` : ''}</div>}
          </div>
        </div>
        <p><strong>{op.nom}</strong>{op.adresse && <><br />{op.adresse}</>}{op.objet && <><br />{op.objet}</>}</p>

        <p style={{ fontSize: 11 }}><b style={{ color: COUL.P }}>P</b> présent · <b style={{ color: COUL.E }}>E</b> excusé · <b style={{ color: COUL.A }}>A</b> absent · <b style={{ color: COUL.N }}>N</b> absent non excusé · C convoqué à la prochaine réunion · Abs. nombre d’absences</p>
        {ORDRE_CATEGORIES.map((cat) => {
          const liste = dossier.intervenants.filter((i) => i.categorie === cat)
          if (!liste.length) return null
          return (
            <table key={cat} style={{ marginTop: 8 }}>
              <thead><tr style={{ background: '#f1e6f0' }}><th style={{ width: '32%' }}>{libelleType(cat).toUpperCase()}</th><th>Société</th><th>Téléphone</th><th>E-mail</th><th>État</th><th>C</th><th>Abs.</th></tr></thead>
              <tbody>{liste.map((i) => {
                const c = contacts.find((x) => x.id === i.contact_id)
                const p = presence(i.id)
                const lot = dossier.lots.find((l) => l.id === i.lot_id)
                const n = cumulAbsences(dossier.presences, i.id, dossier.reunions, reunion.numero)
                return <tr key={i.id}>
                  <td>{lot && <>{lot.code} {lot.libelle}<br /></>}<b>{nomComplet(c)}</b>{c?.fonction ? ` – ${c.fonction}` : ''}</td>
                  <td>{c?.societe}</td><td style={{ whiteSpace: 'nowrap' }}>{c?.mobile ?? c?.telephone}</td><td>{c?.email}</td>
                  <td style={{ color: p?.etat ? COUL[p.etat] : undefined, fontWeight: 700 }}>{p?.etat ?? ''}</td>
                  <td>{p?.convoque ? '✓' : ''}</td><td>{n || ''}</td>
                </tr>
              })}</tbody>
            </table>)
        })}
        {(op.debut_travaux || op.objectif_reception) && <p><b>Calendrier :</b> {op.debut_travaux && `début des travaux ${dateFr(op.debut_travaux)}`}{op.objectif_reception && ` · objectif de réception ${dateFr(op.objectif_reception)}`}</p>}
        {op.clause_diffusion && <p style={{ fontStyle: 'italic' }}>{op.clause_diffusion}</p>}

        {groupes.map((g) => (
          <section key={g.cle}>
            <div className="vb-rub">{g.titre}</div>
            {g.sousTitre && <div style={{ fontSize: 11, padding: '3px 10px' }}>{g.sousTitre}</div>}
            {g.observations.map((o) => {
              const s = statutDe(statuts, o.statut_code)
              const charge = dossier.intervenants.find((i) => i.id === o.a_charge_de)
              const c = contacts.find((x) => x.id === charge?.contact_id)
              return (
                <div key={`${g.cle}-${o.id}`} className="vb-item" style={{ ['--couleur' as string]: s?.couleur ?? '#999' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: s ? fonce(s.couleur) : undefined, fontWeight: 700 }}>{s?.libelle}</span>
                    <span style={{ color: '#5c5560' }}>{o.date_statut ? `depuis le ${dateFr(o.date_statut)}` : ''}{o.cree_le ? `, créée le ${dateFr(o.cree_le)}` : ''}</span>
                    <span style={{ marginLeft: 'auto', background: '#2b2730', color: '#fff', padding: '0 6px', borderRadius: 4 }}>{o.numero}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 3 }}>{o.texte}</div>
                  {avecPhotos && (() => {
                    const ph = dossier.photos.filter((x) => x.observation_id === o.id).map((x) => urlPhoto(urls, x.storage_path)).filter(Boolean)
                    return ph.length ? <div className="vb-photos">{ph.map((u) => <img key={u} src={u} alt="" />)}</div> : null
                  })()}
                  {(charge || o.echeance || o.date_intervention) && <div style={{ color: '#5c5560', marginTop: 3 }}>
                    {charge && `À charge de : ${c?.societe ?? nomComplet(c)}`}{o.echeance && ` · échéance ${dateFr(o.echeance)}`}{o.date_intervention && ` · programmée le ${dateFr(o.date_intervention)}`}
                  </div>}
                </div>)
            })}
          </section>))}
        {avecPlans && dossier.plans.map((pl) => {
          const ids = new Set(affichees.map((o) => o.id))
          const pos = dossier.positions.filter((p) => p.plan_id === pl.id && ids.has(p.observation_id))
          const u = urlPlan(urls, pl)
          if (!pos.length || !u) return null
          const reperes: Repere[] = pos.map((p) => {
            const o = affichees.find((x) => x.id === p.observation_id)!
            return { id: p.id, x: p.x, y: p.y, texte: o.numero, titre: o.numero, couleur: statutDe(statuts, o.statut_code)?.couleur }
          })
          return <section key={pl.id} className="vb-plan">
            <div className="vb-rub">Plan : {pl.libelle}</div>
            <Suspense fallback={null}><Plan url={u} page={pl.page_index} reperes={reperes} /></Suspense>
          </section>
        })}
      </article>
    </main>
  )
}
