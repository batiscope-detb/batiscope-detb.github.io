/**
 * Rapports imprimables (A4) : relevé d'état du bâtiment, diagnostic d'accessibilité, notice d'accessibilité (AT).
 * La page s'imprime telle quelle ; « Enregistrer au format PDF » dans la fenêtre d'impression produit le fichier.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDossier } from '../dossier'
import { LIBELLE_GRAVITE, date, euros, supabase } from '../donnees'
import { travauxParLot } from '../calculs'
import { exigences, libelleMesure, libelleSeuil, LIBELLE_STATUT, taux, VERSION_REFERENTIEL, type Statut } from '../moteur'
import { genererNotice, introduction, RUBRIQUES } from '../notice'
import { useDonnees } from '../App'

type Genre = 'releve' | 'accessibilite' | 'notice'
const TITRES: Record<Genre, string> = {
  releve: "Relevé d'état du bâtiment",
  accessibilite: "Diagnostic d'accessibilité — ERP existant",
  notice: "Notice d'accessibilité",
}
const MOTIFS: Record<string, string> = {
  impossibilite_technique: 'Impossibilité technique', patrimoine_architectural: 'Préservation du patrimoine',
  disproportion_manifeste: 'Disproportion manifeste', refus_copropriete: 'Refus des copropriétaires',
}
const DEROG: Record<string, string> = {
  envisagee: 'Envisagée', redigee: 'Rédigée', deposee: 'Déposée', avis_rendu: 'Avis CCDSA rendu', accordee: 'Accordée', refusee: 'Refusée', caduque: 'Caduque',
}

export default function Rapport() {
  const { id, genre: g } = useParams()
  const genre = (['releve', 'accessibilite', 'notice'].includes(g ?? '') ? g : 'releve') as Genre
  const d = useDossier(id, genre === 'notice' ? null : genre === 'releve' ? 'releves' : 'accessibilite')
  const { nomAgent } = useDonnees()
  const [photosChargees, setPhotosChargees] = useState(false)

  useEffect(() => {
    if (!d.pret) return
    document.title = `${TITRES[genre]} — ${d.ind?.projet.nom ?? ''}`
    // Attendre le chargement des photos avant de proposer l'impression.
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.rapport img')]
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((ok) => { i.onload = ok; i.onerror = ok })))).then(() => setPhotosChargees(true))
    return () => { document.title = 'Relevés DETB — bureau' }
  }, [d.pret, genre, d.ind?.projet.nom])

  if (!d.ind) return <main className="page"><p>Bâtiment introuvable. <Link to="/">Retour</Link></p></main>
  const pr = d.ind.projet

  return (
    <>
      <div className="barre-rapport">
        <Link to={`/erp/${pr.id}`}>← Retour à la fiche</Link>
        <span>{TITRES[genre]} — {pr.nom}</span>
        <button className="bouton primaire" disabled={!d.pret} onClick={() => window.print()}>
          {!d.pret ? 'Préparation…' : photosChargees ? 'Imprimer / enregistrer en PDF' : 'Imprimer (photos en cours de chargement)'}
        </button>
      </div>
      {d.erreur && <p className="erreur" style={{ margin: 20 }}>{d.erreur}</p>}
      {!d.pret && !d.erreur && <div className="chargement"><span className="roue" />Préparation du rapport (photos et plans)…</div>}
      {d.pret && (
        <article className="rapport">
          <Couverture genre={genre} d={d} agent={nomAgent} />
          {genre === 'releve' && <CorpsReleve d={d} />}
          {genre === 'accessibilite' && <CorpsAccessibilite d={d} />}
          {genre === 'notice' && <CorpsNotice d={d} />}
          <footer className="fin-rapport">Document édité le {new Date().toLocaleDateString('fr-FR')} par la Direction Études et Travaux Bâtiments — Ville de Cherbourg-en-Cotentin — appli Relevés DETB v{__VERSION__}</footer>
        </article>
      )}
    </>
  )
}

type Dossier = ReturnType<typeof useDossier>

function Couverture({ genre, d, agent }: { genre: Genre; d: Dossier; agent: string }) {
  const pr = d.ind!.projet
  const photo = pr.photo_path ? d.urls.get(pr.photo_path) : undefined
  const diag = d.ind!.diagnostic
  return (
    <section className="couverture">
      <div className="couv-haut">
        <img src={`${import.meta.env.BASE_URL}logo-detb.png`} alt="" />
        <div>Ville de Cherbourg-en-Cotentin<br />Pôle Patrimoine et Cadre de vie<br /><b>Direction Études et Travaux Bâtiments</b></div>
      </div>
      <div className="couv-titre">
        <p className="couv-genre">{TITRES[genre]}{genre === 'notice' && <><br /><small>à joindre à la demande d'autorisation de construire, d'aménager ou de modifier un ERP (Cerfa n° 13824)</small></>}</p>
        <h1>{pr.nom}</h1>
        <p>{[pr.adresse, pr.commune_deleguee].filter(Boolean).join(' — ')}</p>
        {diag?.type_erp && <p>ERP de type {[diag.type_erp, ...(diag.activites_secondaires ?? [])].join(', ')}{diag.categorie ? ` — ${diag.categorie}e catégorie` : ''}</p>}
      </div>
      {photo && <img className="couv-photo" src={photo} alt={`Photo de ${pr.nom}`} />}
      <table className="couv-infos"><tbody>
        {pr.code && <tr><th>Code patrimoine</th><td>{pr.code}</td></tr>}
        <tr><th>Date d'édition</th><td>{new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
        <tr><th>Établi par</th><td>{agent}</td></tr>
        {genre !== 'releve' && <tr><th>Référentiel</th><td>{VERSION_REFERENTIEL}</td></tr>}
      </tbody></table>
    </section>
  )
}

function Section({ titre, children, saut }: { titre: string; children: ReactNode; saut?: boolean }) {
  return <section className={`section-rapport${saut ? ' saut' : ''}`}><h2>{titre}</h2>{children}</section>
}

const etiquetteGravite = (g: string | null) => (g ? <span className={`etq g-${g}`}>{LIBELLE_GRAVITE[g]}</span> : null)
const etiquetteStatut = (s: Statut | null) => <span className={`etq s-${s ?? 'vide'}`}>{s ? LIBELLE_STATUT[s] : 'À renseigner'}</span>

// --- Relevé d'état -----------------------------------------------------------------------------------
function CorpsReleve({ d }: { d: Dossier }) {
  const ind = d.ind!
  const lots = new Map(d.p.lots.map((l) => [l.id, l.libelle]))
  const points = new Map(d.p.points.map((x) => [x.id, x.libelle]))
  const parLot = travauxParLot(d.constats, d.p.lots)
  const niveauNom = new Map(d.niveaux.map((n) => [n.id, n.libelle]))
  const localNom = new Map(d.locaux.map((l) => [l.id, l]))
  const photos = (cid: string) => (d.detail?.photosReleves ?? []).filter((x) => x.constat_id === cid && x.storage_path).sort((a, b) => a.ordre - b.ordre).map((x) => d.urls.get(x.storage_path!)).filter(Boolean) as string[]
  const pointsDe = (cid: string) => (d.detail?.constatPoints ?? []).filter((x) => x.constat_id === cid).map((x) => points.get(x.point_controle_id) ?? '?')
  const interDe = (cid: string) => (d.detail?.interactions ?? []).filter((x) => x.constat_id === cid).map((x) => lots.get(x.lot_id) ?? '?')
  const groupes = [...d.niveaux.map((n) => ({ id: n.id, libelle: n.libelle })), { id: '', libelle: 'Sans niveau' }]
    .map((g) => ({ ...g, locaux: d.locaux.filter((l) => (g.id ? l.niveau_id === g.id : !l.niveau_id || !niveauNom.has(l.niveau_id))) }))
    .filter((g) => g.locaux.length)
  let numero = 0
  const numeros = new Map(d.constats.map((c) => [c.id, ++numero]))
  return (
    <>
      <Section titre="1. Synthèse" saut>
        <div className="kpi-rapport">
          <div><b>{ind.nbNiveaux}</b>niveau{ind.nbNiveaux > 1 ? 'x' : ''}</div>
          <div><b>{ind.nbLocaux}</b>{ind.nbLocaux > 1 ? 'locaux' : 'local'}</div>
          <div><b>{ind.nbConstats}</b>constat{ind.nbConstats > 1 ? 's' : ''}</div>
          <div><b>{ind.nbUrgents}</b>urgent{ind.nbUrgents > 1 ? 's' : ''}</div>
          <div><b>{euros(ind.estimation)}</b>travaux estimés HT</div>
        </div>
        {parLot.length > 0 && (
          <table className="tab-rapport">
            <thead><tr><th>Corps d'état</th><th className="num">Constats</th><th className="num">dont urgents</th><th className="num">Estimation HT</th></tr></thead>
            <tbody>{parLot.map((l) => <tr key={l.lot}><td>{l.lot}</td><td className="num">{l.nb}</td><td className="num">{l.urgents || '—'}</td><td className="num">{l.montant ? euros(l.montant) : 'non chiffré'}</td></tr>)}</tbody>
            <tfoot><tr><td>Total</td><td className="num">{parLot.reduce((s, l) => s + l.nb, 0)}</td><td className="num">{ind.nbUrgents || '—'}</td><td className="num">{euros(ind.estimation)}</td></tr></tfoot>
          </table>
        )}
        {ind.constatsSansEstimation > 0 && <p className="remarque">{ind.constatsSansEstimation} constat{ind.constatsSansEstimation > 1 ? 's' : ''} sans estimation : le total est minoré d'autant.</p>}
      </Section>

      {d.plans.size > 0 && (
        <Section titre="2. Plans et repères des locaux" saut>
          {d.niveaux.filter((n) => d.plans.has(n.id)).map((n) => {
            const marq = (d.detail?.marqueurs ?? []).filter((m) => m.niveau_id === n.id).sort((a, b) => a.numero - b.numero)
            return (
              <figure key={n.id} className="plan-rapport">
                <figcaption>{n.libelle}</figcaption>
                <img src={d.plans.get(n.id)!.url} alt={`Plan du niveau ${n.libelle}`} />
                {marq.length > 0 && <p className="legende-rapport">{marq.map((m) => `${m.numero}. ${localNom.get(m.local_id)?.libelle ?? '—'}`).join(' · ')}</p>}
              </figure>
            )
          })}
        </Section>
      )}

      <Section titre={`${d.plans.size ? 3 : 2}. Constats par niveau et par local`} saut>
        {groupes.map((g) => (
          <div key={g.id || 'aucun'}>
            <h3>{g.libelle}</h3>
            {g.locaux.map((l) => {
              const cs = d.constats.filter((c) => c.local_id === l.id)
              return (
                <div key={l.id} className="local-rapport">
                  <h4>{l.libelle}{l.type ? ` — ${l.type}` : ''}{l.etat_general != null ? ` — état général ${l.etat_general}/10` : ''}{l.reserve_personnel ? ' — réservé au personnel' : ''}</h4>
                  {cs.length === 0 && <p className="remarque">Aucun constat.</p>}
                  {cs.map((c) => (
                    <div key={c.id} className="constat-rapport">
                      <p className="entete-constat"><b>n° {numeros.get(c.id)} — {c.lot_id ? lots.get(c.lot_id) ?? 'Lot supprimé' : 'Sans lot'}</b> {etiquetteGravite(c.gravite)}
                        {c.estimation != null && <span className="montant">{euros(Number(c.estimation))} HT</span>}</p>
                      {pointsDe(c.id).length > 0 && <p>Points relevés : {pointsDe(c.id).join(' · ')}</p>}
                      {interDe(c.id).length > 0 && <p>Interactions : {interDe(c.id).join(' · ')}</p>}
                      {c.note && <p className="note-constat">{c.note}</p>}
                      {photos(c.id).length > 0 && <div className="photos-rapport">{photos(c.id).map((u) => <img key={u} src={u} alt="" />)}</div>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </Section>

      {d.constats.length > 0 && (
        <Section titre={`${d.plans.size ? 4 : 3}. Récapitulatif des constats`} saut>
          <table className="tab-rapport serre">
            <thead><tr><th>N°</th><th>Niveau</th><th>Local</th><th>Corps d'état</th><th>Gravité</th><th>Observation</th><th className="num">Estimation HT</th></tr></thead>
            <tbody>{d.constats.map((c) => {
              const l = localNom.get(c.local_id)
              return <tr key={c.id}><td>{numeros.get(c.id)}</td><td>{l?.niveau_id ? niveauNom.get(l.niveau_id) : '—'}</td><td>{l?.libelle}</td>
                <td>{c.lot_id ? lots.get(c.lot_id) : '—'}</td><td>{c.gravite ? LIBELLE_GRAVITE[c.gravite] : '—'}</td><td>{c.note ?? ''}</td>
                <td className="num">{c.estimation != null ? euros(Number(c.estimation)) : '—'}</td></tr>
            })}</tbody>
            <tfoot><tr><td colSpan={6}>Total des estimations</td><td className="num">{euros(ind.estimation)}</td></tr></tfoot>
          </table>
        </Section>
      )}
    </>
  )
}

// --- Diagnostic d'accessibilité ------------------------------------------------------------------------
function CorpsAccessibilite({ d }: { d: Dossier }) {
  const ind = d.ind!
  const diag = ind.diagnostic
  if (!diag) return <Section titre="Diagnostic">Pas de diagnostic d'accessibilité pour ce bâtiment.</Section>
  const acc = new Map(d.p.accNiveaux.map((a) => [a.niveau_id, a]))
  const parSeq = new Map<string, typeof ind.elements>()
  for (const e of ind.elements) parSeq.set(e.element.sequence, [...(parSeq.get(e.element.sequence) ?? []), e])
  const derogPar = new Map(d.derogations.map((x) => [`${x.element_id}|${x.regle_id}`, x]))
  const photosDe = (eid: string, rid: string | null) => (d.detail?.photosAcc ?? []).filter((x) => x.element_id === eid && (x.regle_id ?? null) === rid && x.storage_path).map((x) => d.urls.get(x.storage_path!)).filter(Boolean) as string[]
  const bloquantes = ind.elements.flatMap((e) => e.lignes.filter((l) => l.statut === 'NC' && l.regle.gravite === 'Bloquant').map((l) => ({ e, l })))
  const nomNiveau = new Map(d.niveaux.map((n) => [n.id, n.libelle]))
  const t = taux(ind.acc)
  return (
    <>
      <Section titre="1. Contexte de l'établissement" saut>
        <table className="tab-rapport"><tbody>
          <tr><th>Type / activités</th><td>{[diag.type_erp, ...(diag.activites_secondaires ?? [])].filter(Boolean).join(', ') || '—'}</td><th>Catégorie</th><td>{diag.categorie ? `${diag.categorie}e` : '—'}</td></tr>
          <tr><th>Mission de service public</th><td>{diag.mission_service_public ? 'Oui' : 'Non'}</td><th>Effectif admis aux étages</th><td>{diag.effectif_etages ?? '—'}</td></tr>
          <tr><th>Prestations uniquement en étage</th><td>{diag.prestations_hors_rdc ? 'Oui' : 'Non'}</td><th>Contrainte structurelle</th><td>{diag.contrainte_structurelle ? 'Oui' : 'Non'}</td></tr>
          <tr><th>Places de stationnement public</th><td>{diag.nb_places_parking ?? '—'}</td><th>Places assises</th><td>{diag.nb_places_assises ?? '—'}</td></tr>
          {diag.zone_ert && <tr><th>Zone de travail (ERT)</th><td colSpan={3}>{diag.zone_ert_description || 'Oui'} — hors du champ du diagnostic (Code du travail)</td></tr>}
        </tbody></table>
        {d.niveaux.some((n) => acc.get(n.id)) && (
          <table className="tab-rapport"><thead><tr><th>Niveau</th><th>Accès</th><th>Accessible en fauteuil</th><th className="num">Effectif public</th><th className="num">Effectif personnel</th></tr></thead>
            <tbody>{d.niveaux.map((n) => { const a = acc.get(n.id); return <tr key={n.id}><td>{n.libelle}</td><td>{a?.niveau_acces ? 'Niveau d’accès' : ''}</td><td>{a?.accessible_fauteuil ? 'Oui' : 'Non'}</td><td className="num">{a?.effectif_public ?? '—'}</td><td className="num">{a?.effectif_personnel ?? '—'}</td></tr> })}</tbody></table>
        )}
        {diag.observations && <p>{diag.observations}</p>}
        <h3>Exigences calculées</h3>
        <table className="tab-rapport"><tbody>{exigences(diag).map((x) => <tr key={x.regleId}><td>{x.libelle} <small>({x.regleId})</small></td><td>{x.valeur}</td></tr>)}</tbody></table>
      </Section>

      <Section titre="2. Synthèse" saut>
        <div className="kpi-rapport">
          <div><b>{t == null ? '—' : `${t} %`}</b>taux de conformité</div>
          <div><b>{ind.acc.conformes}</b>conformes</div>
          <div><b>{ind.acc.sousTolerance}</b>sous tolérance</div>
          <div><b>{ind.acc.nonConformes}</b>non conformes</div>
          <div><b>{ind.acc.bloquantes}</b>bloquantes</div>
        </div>
        <table className="tab-rapport"><thead><tr><th>Séquence du parcours</th><th className="num">Éléments</th><th className="num">C</th><th className="num">CT</th><th className="num">NC</th><th className="num">À expertiser</th></tr></thead>
          <tbody>{[...parSeq.entries()].sort().map(([seq, els]) => {
            const s = els.reduce((a, e) => ({ c: a.c + e.synthese.conformes, ct: a.ct + e.synthese.sousTolerance, nc: a.nc + e.synthese.nonConformes, ae: a.ae + e.synthese.aExpertiser }), { c: 0, ct: 0, nc: 0, ae: 0 })
            return <tr key={seq}><td>{seq}</td><td className="num">{els.length}</td><td className="num">{s.c}</td><td className="num">{s.ct}</td><td className="num">{s.nc}</td><td className="num">{s.ae}</td></tr>
          })}</tbody></table>
        <p className="remarque">Taux de conformité = (conformes + conformes sous tolérance) / points évalués. C : conforme ; CT : conforme dans la limite des tolérances admises pour les ERP existants ; NC : non conforme.</p>
        {bloquantes.length > 0 && <>
          <h3>Non-conformités bloquantes</h3>
          <ul>{bloquantes.map(({ e, l }) => <li key={`${e.element.id}${l.regle.id}`}><b>{e.element.libelle}</b> — {l.regle.point} ({l.regle.id}){derogPar.get(`${e.element.id}|${l.regle.id}`) ? ' — dérogation demandée' : ''}</li>)}</ul>
        </>}
      </Section>

      {d.plans.size > 0 && (
        <Section titre="3. Localisation des éléments" saut>
          {d.niveaux.filter((n) => d.plans.has(n.id)).map((n) => {
            const els = ind.elements.filter((e) => e.element.niveau_id === n.id && e.element.plan_x != null && e.element.plan_y != null)
            return (
              <figure key={n.id} className="plan-rapport">
                <figcaption>{n.libelle}</figcaption>
                <img src={d.plans.get(n.id)!.url} alt={`Plan du niveau ${n.libelle}`} />
                {els.length > 0 && <p className="legende-rapport">{els.map((e, k) => `${k + 1}. ${e.element.libelle}`).join(' · ')}</p>}
              </figure>
            )
          })}
        </Section>
      )}

      <Section titre={`${d.plans.size ? 4 : 3}. Détail par élément`} saut>
        {[...parSeq.entries()].sort().map(([seq, els]) => (
          <div key={seq}>
            <h3>{seq}</h3>
            {els.map((e) => (
              <div key={e.element.id} className="local-rapport">
                <h4>{e.element.libelle} — {e.element.element_type}{e.element.niveau_id ? ` — ${nomNiveau.get(e.element.niveau_id) ?? ''}` : ''}{e.element.travaux_prevus ? ' — travaux prévus' : ''}
                  <span className="montant">{taux(e.synthese) == null ? '' : `${taux(e.synthese)} %`}</span></h4>
                {photosDe(e.element.id, null).length > 0 && <div className="photos-rapport">{photosDe(e.element.id, null).map((u) => <img key={u} src={u} alt="" />)}</div>}
                <table className="tab-rapport serre">
                  <thead><tr><th>Règle</th><th>Point de contrôle</th><th>Exigence</th><th className="num">Mesure</th><th>Statut</th></tr></thead>
                  <tbody>{e.lignes.filter((l) => l.statut !== 'SO').map((l) => {
                    const der = derogPar.get(`${e.element.id}|${l.regle.id}`)
                    const ph = photosDe(e.element.id, l.regle.id)
                    return (
                      <tr key={l.regle.id}>
                        <td>{l.regle.id}<br /><small>{l.regle.article}</small></td>
                        <td>{l.regle.point}
                          {l.palierRetenu && <><br /><small>Tolérance : {l.palierRetenu.point}</small></>}
                          {l.saisie?.commentaire && <><br /><small>{l.saisie.commentaire}</small></>}
                          {der && <><br /><small>Dérogation {DEROG[der.statut]?.toLowerCase()} — {MOTIFS[der.motif]}</small></>}
                          {ph.length > 0 && <div className="photos-rapport petites">{ph.map((u) => <img key={u} src={u} alt="" />)}</div>}
                        </td>
                        <td>{libelleSeuil(l.regle) ?? l.regle.valeurTexte ?? '—'}</td>
                        <td className="num">{libelleMesure(l)}</td>
                        <td>{etiquetteStatut(l.statut)}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            ))}
          </div>
        ))}
      </Section>

      {d.derogations.length > 0 && (
        <Section titre={`${d.plans.size ? 5 : 4}. Demandes de dérogation`} saut>
          <table className="tab-rapport"><thead><tr><th>Règle</th><th>Motif</th><th>Objet</th><th>Mesures de substitution</th><th>Statut</th></tr></thead>
            <tbody>{d.derogations.map((x) => <tr key={x.id}><td>{x.regle_id ?? '—'}</td><td>{MOTIFS[x.motif] ?? x.motif}{x.sous_motif ? ` — ${x.sous_motif}` : ''}</td><td>{x.objet}</td><td>{x.mesures_substitution ?? '—'}</td><td>{DEROG[x.statut] ?? x.statut}{x.date_depot ? ` (déposée le ${date(x.date_depot)})` : ''}</td></tr>)}</tbody></table>
        </Section>
      )}
    </>
  )
}

// --- Notice d'accessibilité ---------------------------------------------------------------------------------
interface Entete { activite: string | null; numero_dossier: string | null; parties_ouvertes: string | null; description_travaux: string | null; maitre_ouvrage: string | null; maitre_oeuvre: string | null; date_notice: string | null }
interface Paragraphe { id: string; rubrique: string; element_id: string | null; ordre: number; texte_auto: string | null; texte_modifie: string | null }

function CorpsNotice({ d }: { d: Dossier }) {
  const diag = d.ind!.diagnostic
  const [entete, setEntete] = useState<Entete | null>(null)
  const [paras, setParas] = useState<Paragraphe[] | null>(null)
  useEffect(() => {
    if (!diag) return
    Promise.all([
      supabase.schema('accessibilite').from('notice_entete').select('*').eq('diagnostic_id', diag.id).is('supprime_le', null).maybeSingle(),
      supabase.schema('accessibilite').from('notice_paragraphe').select('id,rubrique,element_id,ordre,texte_auto,texte_modifie').eq('diagnostic_id', diag.id).is('supprime_le', null),
    ]).then(([e, p]) => { setEntete((e.data as Entete | null) ?? null); setParas((p.data as Paragraphe[] | null) ?? []) })
  }, [diag?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!diag) return <Section titre="Notice">Pas de diagnostic d'accessibilité : la notice ne peut pas être établie.</Section>
  if (!paras) return <div className="chargement"><span className="roue" />Chargement de la notice…</div>
  // Notice enregistrée si elle existe, sinon texte généré à la volée depuis le diagnostic.
  const liste: Paragraphe[] = paras.length ? paras : genererNotice(d.ind!.elements, d.derogations).map((x, i) => ({ id: String(i), ...x, texte_modifie: null }))
  return (
    <>
      <Section titre="Identification du projet" saut>
        <table className="tab-rapport"><tbody>
          <tr><th>Établissement</th><td>{d.ind!.projet.nom} — {[d.ind!.projet.adresse, d.ind!.projet.commune_deleguee].filter(Boolean).join(', ')}</td></tr>
          <tr><th>Activité</th><td>{entete?.activite || '—'}</td></tr>
          <tr><th>N° de dossier</th><td>{entete?.numero_dossier || '—'}</td></tr>
          <tr><th>Maître d'ouvrage</th><td>{entete?.maitre_ouvrage || 'Ville de Cherbourg-en-Cotentin'}</td></tr>
          <tr><th>Maître d'œuvre</th><td>{entete?.maitre_oeuvre || 'Direction Études et Travaux Bâtiments'}</td></tr>
          <tr><th>Parties ouvertes au public</th><td>{entete?.parties_ouvertes || '—'}</td></tr>
          <tr><th>Nature des travaux</th><td>{entete?.description_travaux || '—'}</td></tr>
        </tbody></table>
        <p>{introduction(diag, d.ind!.projet.nom)}</p>
      </Section>
      <Section titre="Dispositions prises, rubrique par rubrique">
        {RUBRIQUES.map((r) => {
          const ps = liste.filter((x) => x.rubrique === r.code).sort((a, b) => a.ordre - b.ordre)
          return (
            <div key={r.code} className="rubrique-notice">
              <h3>{r.code}. {r.titre}</h3>
              {ps.length === 0 ? <p className="remarque">Sans objet ou non concerné par le projet.</p>
                : ps.map((x) => <p key={x.id} className="para-notice">{x.texte_modifie ?? x.texte_auto}</p>)}
            </div>
          )
        })}
      </Section>
      {d.derogations.length > 0 && (
        <Section titre="Demandes de dérogation jointes">
          <ul>{d.derogations.map((x) => <li key={x.id}><b>{x.regle_id}</b> — {MOTIFS[x.motif] ?? x.motif} : {x.objet}{x.mesures_substitution ? ` Mesures de substitution : ${x.mesures_substitution}` : ''}</li>)}</ul>
        </Section>
      )}
      <p className="signature">Fait à Cherbourg-en-Cotentin, le {entete?.date_notice ? date(entete.date_notice) : new Date().toLocaleDateString('fr-FR')}<br /><br />Le maître d'ouvrage</p>
    </>
  )
}
