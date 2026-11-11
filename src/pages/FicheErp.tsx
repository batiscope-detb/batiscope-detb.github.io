import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDonnees } from '../App'
import { BUCKETS, LIBELLE_GRAVITE, LIBELLE_STATUT_ERP, chargerDetail, date, euros, octets, urlsSignees, type DetailProjet } from '../donnees'
import { travauxParLot, type LigneElement } from '../calculs'
import { exigences, libelleMesure, libelleSeuil, LIBELLE_STATUT, VERSION_REFERENTIEL, type Ligne } from '../moteur'
import { BarreConformite, EtiquetteStatut } from '../composants/Barres'
import { Photos } from '../composants/Photos'
import type { Repere } from '../composants/Plan'
const Plan = lazy(() => import('../composants/Plan').then((m) => ({ default: m.Plan })))

type Onglet = 'synthese' | 'releves' | 'accessibilite' | 'plans'
const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: 'synthese', libelle: 'Synthèse' }, { id: 'releves', libelle: 'Relevés' }, { id: 'accessibilite', libelle: 'Accessibilité' }, { id: 'plans', libelle: 'Plans' },
]
const LIBELLE_MOTIF: Record<string, string> = {
  impossibilite_technique: 'Impossibilité technique', patrimoine_architectural: 'Préservation du patrimoine',
  disproportion_manifeste: 'Disproportion manifeste', refus_copropriete: 'Refus des copropriétaires',
}
const LIBELLE_DEROG: Record<string, string> = {
  envisagee: 'Envisagée', redigee: 'Rédigée', deposee: 'Déposée', avis_rendu: 'Avis CCDSA rendu', accordee: 'Accordée', refusee: 'Refusée', caduque: 'Caduque',
}
const couleurEtat = (n: number | null) => (n == null ? '#5D5A82' : n >= 7 ? '#2E7D32' : n >= 4 ? '#C88A12' : '#B3261E')

export default function FicheErp() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const onglet = (params.get('onglet') as Onglet) || 'synthese'
  const { donnees } = useDonnees()
  const p = donnees!.patrimoine
  const ind = donnees!.indicateurs.find((i) => i.projet.id === id)

  const niveaux = useMemo(() => p.niveaux.filter((n) => n.projet_id === id).sort((a, b) => a.ordre - b.ordre), [p, id])
  const locaux = useMemo(() => p.locaux.filter((l) => l.projet_id === id), [p, id])
  const constats = useMemo(() => { const ids = new Set(locaux.map((l) => l.id)); return p.constats.filter((c) => ids.has(c.local_id)) }, [p, locaux])
  const derogations = useMemo(() => p.derogations.filter((d) => d.diagnostic_id === ind?.diagnostic?.id), [p, ind])

  const [detail, setDetail] = useState<DetailProjet | null>(null)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [erreur, setErreur] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<'tous' | 'NC' | 'reste'>('tous')
  const [choix, setChoix] = useState<string | null>(null)

  useEffect(() => {
    if (!ind) return
    let annule = false
    setDetail(null); setErreur(null)
    chargerDetail(ind.projet.id, constats.map((c) => c.id), niveaux.map((n) => n.id), ind.elements.map((e) => e.element.id), ind.diagnostic?.id ?? null)
      .then(async (d) => {
        if (annule) return
        setDetail(d)
        const [a, b, c] = await Promise.all([
          urlsSignees(BUCKETS.photos, [...d.photosReleves.map((x) => x.storage_path ?? ''), ind.projet.photo_path ?? '']),
          urlsSignees(BUCKETS.photosAcc, d.photosAcc.map((x) => x.storage_path ?? '')),
          urlsSignees(BUCKETS.plans, d.plans.map((x) => x.storage_path ?? '')),
        ])
        if (!annule) setUrls(new Map([...a, ...b, ...c]))
      })
      .catch((e: Error) => !annule && setErreur(e.message))
    return () => { annule = true }
  }, [ind?.projet.id, ind?.projet.maj_le, donnees?.chargeLe]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ind) return <main className="page"><p>Ce bâtiment n'existe pas ou a été supprimé. <Link to="/">Retour au tableau de bord</Link></p></main>
  const pr = ind.projet
  const photoBat = pr.photo_path ? urls.get(pr.photo_path) : undefined
  const agents = new Map((detail?.agents ?? []).map((a) => [a.id, a.nom]))

  return (
    <main className="page">
      <div><Link to="/">← Tableau de bord</Link></div>
      <section className="carte entete-fiche">
        {photoBat ? <img src={photoBat} alt={`Photo de ${pr.nom}`} /> : <div className="vignette-vide">{pr.photo_path ? 'Chargement…' : 'Pas de photo'}</div>}
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <h1>{pr.nom}</h1>
            <span className={`etiquette e-${ind.statut}`}>{LIBELLE_STATUT_ERP[ind.statut]}</span>
          </div>
          <dl className="infos">
            <div><dt>Adresse</dt><dd>{pr.adresse || '—'}</dd></div>
            <div><dt>Commune déléguée</dt><dd>{pr.commune_deleguee || '—'}</dd></div>
            <div><dt>Code patrimoine</dt><dd>{pr.code || '—'}</dd></div>
            <div><dt>Contact</dt><dd>{pr.contact || '—'}</dd></div>
            {ind.diagnostic && <div><dt>Classement ERP</dt><dd>{ind.diagnostic.type_erp ? `Type ${ind.diagnostic.type_erp}` : 'Type non renseigné'}{ind.diagnostic.categorie ? ` — ${ind.diagnostic.categorie}e catégorie` : ''}</dd></div>}
            <div><dt>Dernière mise à jour</dt><dd>{date(ind.derniereMaj)}{pr.maj_par && agents.get(pr.maj_par) ? ` par ${agents.get(pr.maj_par)}` : ''}</dd></div>
          </dl>
        </div>
      </section>

      <div className="onglets" role="tablist">
        {ONGLETS.map((o) => (
          <button key={o.id} role="tab" aria-selected={onglet === o.id} onClick={() => setParams({ onglet: o.id }, { replace: true })}>{o.libelle}</button>
        ))}
      </div>
      {erreur && <p className="erreur">Détails indisponibles : {erreur}</p>}

      {onglet === 'synthese' && Synthese()}
      {onglet === 'releves' && Releves()}
      {onglet === 'accessibilite' && Accessibilite()}
      {onglet === 'plans' && Plans()}
    </main>
  )

  function Synthese() {
    const lots = travauxParLot(constats, p.lots)
    return (
      <>
        <section className="grille-kpi">
          <div className="kpi"><span>Niveaux / locaux</span><b>{ind!.nbNiveaux} / {ind!.nbLocaux}</b></div>
          <div className="kpi"><span>Constats</span><b>{ind!.nbConstats}</b><small>{ind!.nbUrgents} urgent(s), {ind!.nbAPrevoir} à prévoir</small></div>
          <div className="kpi"><span>Travaux estimés</span><b>{euros(ind!.estimation)}</b><small>{ind!.constatsSansEstimation ? `${ind!.constatsSansEstimation} constat(s) non chiffré(s)` : 'HT'}</small></div>
          <div className="kpi"><span>Accessibilité</span><b>{ind!.taux == null ? '—' : `${ind!.taux} %`}</b><small>{ind!.acc.nonConformes} NC dont {ind!.acc.bloquantes} bloquante(s)</small></div>
          <div className="kpi"><span>Fichiers sur le serveur</span><b>{octets(ind!.octets)}</b><small>photos et plans</small></div>
        </section>
        <div className="deux-col">
          <section className="carte">
            <h2>Travaux par corps d'état</h2>
            {lots.length === 0 ? <p className="vide">Aucun constat à chiffrer.</p> : (
              <table className="tableau"><thead><tr><th>Corps d'état</th><th className="num">Constats</th><th className="num">Urgents</th><th className="num">Estimation HT</th></tr></thead>
                <tbody>{lots.map((l) => <tr key={l.lot}><td>{l.lot}</td><td className="num">{l.nb}</td><td className="num">{l.urgents || '—'}</td><td className="num">{l.montant ? euros(l.montant) : '—'}</td></tr>)}</tbody>
                <tfoot><tr><td><b>Total</b></td><td className="num"><b>{lots.reduce((s, l) => s + l.nb, 0)}</b></td><td /><td className="num"><b>{euros(ind!.estimation)}</b></td></tr></tfoot>
              </table>
            )}
          </section>
          <section className="carte">
            <h2>Accessibilité</h2>
            {!ind!.diagnostic ? <p className="vide">Pas encore de diagnostic accessibilité.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <BarreConformite s={ind!.acc} large />
                <table className="tableau"><tbody>
                  <tr><td>Conformes</td><td className="num">{ind!.acc.conformes}</td></tr>
                  <tr><td>Conformes sous tolérance</td><td className="num">{ind!.acc.sousTolerance}</td></tr>
                  <tr><td>Non conformes</td><td className="num">{ind!.acc.nonConformes}</td></tr>
                  <tr><td>dont bloquantes</td><td className="num">{ind!.acc.bloquantes}</td></tr>
                  <tr><td>À expertiser</td><td className="num">{ind!.acc.aExpertiser}</td></tr>
                  <tr><td>À renseigner</td><td className="num">{ind!.acc.aRenseigner}</td></tr>
                  <tr><td>Dérogations en cours / accordées</td><td className="num">{ind!.derogationsEnCours} / {ind!.derogationsAccordees}</td></tr>
                </tbody></table>
              </div>
            )}
          </section>
        </div>
      </>
    )
  }

  function Releves() {
    if (!locaux.length) return <p className="vide">Aucun local relevé pour l'instant.</p>
    const lots = new Map(p.lots.map((l) => [l.id, l.libelle]))
    const points = new Map((detail?.points ?? []).map((x) => [x.id, x.libelle]))
    const pointsPar = new Map<string, string[]>()
    for (const cp of detail?.constatPoints ?? []) pointsPar.set(cp.constat_id, [...(pointsPar.get(cp.constat_id) ?? []), points.get(cp.point_controle_id) ?? '?'])
    const photosPar = new Map<string, string[]>()
    for (const ph of (detail?.photosReleves ?? []).slice().sort((a, b) => a.ordre - b.ordre)) if (ph.storage_path) photosPar.set(ph.constat_id, [...(photosPar.get(ph.constat_id) ?? []), ph.storage_path])
    const niveauNom = new Map(niveaux.map((n) => [n.id, n.libelle]))
    const groupes = [...niveaux.map((n) => ({ id: n.id, libelle: n.libelle })), { id: '', libelle: 'Sans niveau' }]
      .map((g) => ({ ...g, locaux: locaux.filter((l) => (l.niveau_id ?? '') === g.id && (g.id || !niveauNom.has(l.niveau_id ?? ''))).sort((a, b) => a.ordre - b.ordre) }))
      .filter((g) => g.locaux.length)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {groupes.map((g) => (
          <section key={g.id || 'aucun'}>
            <h2>{g.libelle}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.locaux.map((l) => {
                const cs = constats.filter((c) => c.local_id === l.id)
                return (
                  <details className="bloc" key={l.id} open={cs.some((c) => c.gravite === 'urgent')}>
                    <summary>
                      <span>{l.libelle}</span>
                      {l.type && <span className="etiquette e-gris">{l.type}</span>}
                      {l.etat_general != null && <span className="etiquette" style={{ background: couleurEtat(l.etat_general), color: '#fff' }}>État {l.etat_general}/10</span>}
                      <span style={{ marginLeft: 'auto', color: 'var(--encre-2)', fontWeight: 400 }}>{cs.length} constat{cs.length > 1 ? 's' : ''}</span>
                    </summary>
                    <div>
                      {cs.length === 0 ? <p className="vide" style={{ padding: 6 }}>Aucun constat.</p> : cs.map((c) => (
                        <div key={c.id} style={{ borderTop: '1px solid var(--bord)', padding: '10px 0' }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <b>{c.lot_id ? lots.get(c.lot_id) ?? 'Lot supprimé' : 'Sans lot'}</b>
                            {c.gravite && <span className={`etiquette ${c.gravite === 'urgent' ? 'e-rouge' : c.gravite === 'a_prevoir' ? 'e-ambre' : 'e-gris'}`}>{LIBELLE_GRAVITE[c.gravite]}</span>}
                            {c.estimation != null && <span className="num">{euros(Number(c.estimation))} HT</span>}
                            <span style={{ marginLeft: 'auto', color: 'var(--encre-2)', fontSize: 12 }}>{date(c.maj_le)}{c.maj_par && agents.get(c.maj_par) ? ` — ${agents.get(c.maj_par)}` : ''}</span>
                          </div>
                          {pointsPar.get(c.id) && <div style={{ fontSize: 13, marginTop: 4 }}>Points relevés : {pointsPar.get(c.id)!.join(' · ')}</div>}
                          {c.note && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{c.note}</p>}
                          <Photos urls={(photosPar.get(c.id) ?? []).map((s) => urls.get(s))} />
                        </div>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    )
  }

  function Accessibilite() {
    const d = ind!.diagnostic
    if (!d) return <p className="vide">Pas encore de diagnostic accessibilité pour ce bâtiment.</p>
    const photosPar = new Map<string, string[]>()
    for (const ph of detail?.photosAcc ?? []) if (ph.storage_path) {
      const k = `${ph.element_id}|${ph.regle_id ?? ''}`; photosPar.set(k, [...(photosPar.get(k) ?? []), ph.storage_path])
    }
    const derogPar = new Map(derogations.map((x) => [`${x.element_id}|${x.regle_id}`, x]))
    const garder = (l: Ligne) => filtre === 'tous' || (filtre === 'NC' ? l.statut === 'NC' : l.statut == null || l.statut === 'AE' || l.statut === 'NV')
    const parSequence = new Map<string, LigneElement[]>()
    for (const e of ind!.elements) parSequence.set(e.element.sequence, [...(parSequence.get(e.element.sequence) ?? []), e])
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="deux-col">
          <section className="carte">
            <h2>Contexte de l'ERP</h2>
            <dl className="infos" style={{ marginTop: 0 }}>
              <div><dt>Type / catégorie</dt><dd>{d.type_erp ?? '—'} / {d.categorie ? `${d.categorie}e` : '—'}</dd></div>
              <div><dt>Mission de service public</dt><dd>{d.mission_service_public ? 'Oui' : 'Non'}</dd></div>
              <div><dt>Effectif en étages</dt><dd>{d.effectif_etages ?? '—'}</dd></div>
              <div><dt>Prestations hors RDC</dt><dd>{d.prestations_hors_rdc ? 'Oui' : 'Non'}</dd></div>
              <div><dt>Contrainte structurelle</dt><dd>{d.contrainte_structurelle ? 'Oui' : 'Non'}</dd></div>
              <div><dt>Places de stationnement / assises</dt><dd>{d.nb_places_parking ?? '—'} / {d.nb_places_assises ?? '—'}</dd></div>
            </dl>
            {d.observations && <p style={{ whiteSpace: 'pre-wrap' }}>{d.observations}</p>}
          </section>
          <section className="carte">
            <h2>Exigences calculées</h2>
            <table className="tableau"><tbody>
              {exigences(d).map((x) => <tr key={x.regleId}><td>{x.libelle}<div style={{ color: 'var(--encre-2)', fontSize: 11 }}>{x.regleId}</div></td><td>{x.valeur}</td></tr>)}
            </tbody></table>
          </section>
        </div>

        <div className="filtres">
          <label>Afficher
            <select className="champ" value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)}>
              <option value="tous">Tous les points</option><option value="NC">Non-conformités</option><option value="reste">À renseigner ou à expertiser</option>
            </select>
          </label>
          <span style={{ color: 'var(--encre-2)', fontSize: 12, alignSelf: 'center' }}>{VERSION_REFERENTIEL}</span>
        </div>

        {ind!.elements.length === 0 && <p className="vide">Aucun élément relevé.</p>}
        {[...parSequence.entries()].sort().map(([seq, els]) => (
          <section key={seq}>
            <h2>{seq}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {els.map((e) => {
                const ls = e.lignes.filter(garder)
                if (!ls.length && filtre !== 'tous') return null
                return (
                  <details className="bloc" key={e.element.id} open={filtre !== 'tous'}>
                    <summary>
                      <span>{e.element.libelle}</span>
                      <span className="etiquette e-gris">{e.element.element_type}</span>
                      {e.element.travaux_prevus && <span className="etiquette e-ambre">Travaux prévus</span>}
                      <span style={{ marginLeft: 'auto', minWidth: 160 }}><BarreConformite s={e.synthese} /></span>
                    </summary>
                    <div className="tableau-conteneur">
                      <table className="tableau">
                        <thead><tr><th>Règle</th><th>Point de contrôle</th><th>Exigence</th><th>Mesure</th><th>Statut</th></tr></thead>
                        <tbody>
                          {ls.map((l) => {
                            const der = derogPar.get(`${e.element.id}|${l.regle.id}`)
                            const ph = photosPar.get(`${e.element.id}|${l.regle.id}`) ?? []
                            return (
                              <tr key={l.regle.id}>
                                <td style={{ whiteSpace: 'nowrap' }}>{l.regle.id}<div style={{ color: 'var(--encre-2)', fontSize: 11 }}>{l.regle.article}</div></td>
                                <td>{l.regle.point}
                                  {l.palierRetenu && <div style={{ fontSize: 12, color: '#1F6B55' }}>Tolérance appliquée : {l.palierRetenu.point}</div>}
                                  {l.saisie?.commentaire && <div style={{ fontSize: 12, color: 'var(--encre-2)', whiteSpace: 'pre-wrap' }}>{l.saisie.commentaire}</div>}
                                  {der && <div style={{ fontSize: 12, marginTop: 2 }}><span className="etiquette e-bleu">Dérogation {LIBELLE_DEROG[der.statut]?.toLowerCase()}</span> {LIBELLE_MOTIF[der.motif]}</div>}
                                  <Photos urls={ph.map((s) => urls.get(s))} />
                                </td>
                                <td style={{ whiteSpace: 'nowrap' }}>{libelleSeuil(l.regle) ?? (l.regle.valeurTexte || '—')}</td>
                                <td className="num">{libelleMesure(l)}</td>
                                <td><EtiquetteStatut statut={l.statut} />{l.regle.gravite === 'Bloquant' && l.statut === 'NC' && <div style={{ fontSize: 11, color: 'var(--rouge)' }}>Bloquant</div>}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )
              })}
            </div>
          </section>
        ))}

        {derogations.length > 0 && (
          <section className="carte">
            <h2>Demandes de dérogation</h2>
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead><tr><th>Règle</th><th>Motif</th><th>Objet</th><th>Statut</th><th>Dépôt</th><th>Décision</th></tr></thead>
                <tbody>{derogations.map((x) => (
                  <tr key={x.id}><td>{x.regle_id ?? '—'}</td><td>{LIBELLE_MOTIF[x.motif] ?? x.motif}{x.sous_motif ? ` — ${x.sous_motif}` : ''}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{x.objet}</td><td>{LIBELLE_DEROG[x.statut] ?? x.statut}</td><td>{date(x.date_depot)}</td><td>{date(x.date_decision)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        )}
        <p style={{ color: 'var(--encre-2)', fontSize: 12 }}>Statuts calculés avec le même moteur que la tablette ({Object.values(LIBELLE_STATUT).join(', ')}).</p>
      </div>
    )
  }

  function Plans() {
    if (!detail) return <div className="chargement"><span className="roue" />Chargement des plans…</div>
    const avecPlan = niveaux.filter((n) => detail.plans.some((pl) => pl.niveau_id === n.id && pl.storage_path))
    if (!avecPlan.length) return <p className="vide">Aucun plan importé pour ce bâtiment.</p>
    const niv = avecPlan.find((n) => n.id === choix) ?? avecPlan[0]
    const plan = detail.plans.find((pl) => pl.niveau_id === niv.id)!
    const url = urls.get(plan.storage_path!)
    const localParId = new Map(locaux.map((l) => [l.id, l]))
    const reperes: Repere[] = [
      ...detail.marqueurs.filter((m) => m.niveau_id === niv.id).map((m) => {
        const l = localParId.get(m.local_id)
        return { id: m.id, x: m.x_relatif, y: m.y_relatif, texte: String(m.numero), titre: l?.libelle ?? 'Local', couleur: couleurEtat(l?.etat_general ?? null) }
      }),
      ...ind!.elements.filter((e) => e.element.niveau_id === niv.id && e.element.plan_x != null && e.element.plan_y != null).map((e) => ({
        id: e.element.id, x: e.element.plan_x!, y: e.element.plan_y!, acc: true,
        texte: e.synthese.nonConformes ? `${e.synthese.nonConformes}` : '✓', titre: `${e.element.libelle} — ${e.synthese.nonConformes} non-conformité(s)`,
      })),
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="filtres">
          <label>Niveau
            <select className="champ" value={niv.id} onChange={(e) => setChoix(e.target.value)}>
              {avecPlan.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
            </select>
          </label>
          <span style={{ fontSize: 12, color: 'var(--encre-2)', alignSelf: 'center' }}>
            Ronds : locaux (couleur selon l'état général) — carrés dorés : éléments accessibilité (nombre de non-conformités)
          </span>
        </div>
        {url ? <Suspense fallback={<div className="chargement"><span className="roue" />Chargement de la visionneuse…</div>}><Plan url={url} page={plan.page_index} reperes={reperes} /></Suspense> : <div className="chargement"><span className="roue" />Préparation du plan…</div>}
        {reperes.length > 0 && (
          <section className="carte">
            <h2>Légende</h2>
            <table className="tableau"><tbody>
              {detail.marqueurs.filter((m) => m.niveau_id === niv.id).sort((a, b) => a.numero - b.numero).map((m) => {
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
}
