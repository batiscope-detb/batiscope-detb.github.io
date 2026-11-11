import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDonnees } from '../App'
import { BUCKETS, LIBELLE_STATUT_ERP, chargerDetail, date, urlsSignees, type DetailProjet } from '../donnees'
import { ContexteFiche, type Fiche } from './fiche/contexte'
import Synthese from './fiche/Synthese'
import Batiment from './fiche/Batiment'
import Releves from './fiche/Releves'
import Accessibilite from './fiche/Accessibilite'
import Plans from './fiche/Plans'
import { DialogueProjet } from './fiche/DialogueProjet'

type Onglet = 'synthese' | 'batiment' | 'releves' | 'accessibilite' | 'plans'
const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: 'synthese', libelle: 'Synthèse' }, { id: 'batiment', libelle: 'Niveaux et locaux' }, { id: 'releves', libelle: 'Relevés' },
  { id: 'accessibilite', libelle: 'Accessibilité' }, { id: 'plans', libelle: 'Plans et repères' },
]


export default function FicheErp() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const onglet = (params.get('onglet') as Onglet) || 'synthese'
  const { donnees, modifier, edition } = useDonnees()
  const p = donnees!.patrimoine
  const ind = donnees!.indicateurs.find((i) => i.projet.id === id)
  const [modifProjet, setModifProjet] = useState(false)

  const niveaux = useMemo(() => p.niveaux.filter((n) => n.projet_id === id).sort((a, b) => a.ordre - b.ordre), [p, id])
  const locaux = useMemo(() => p.locaux.filter((l) => l.projet_id === id).sort((a, b) => a.ordre - b.ordre), [p, id])
  const constats = useMemo(() => { const ids = new Set(locaux.map((l) => l.id)); return p.constats.filter((c) => ids.has(c.local_id)) }, [p, locaux])
  const derogations = useMemo(() => p.derogations.filter((d) => d.diagnostic_id === ind?.diagnostic?.id), [p, ind])

  const [detail, setDetail] = useState<DetailProjet | null>(null)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [erreur, setErreur] = useState<string | null>(null)

  const ajouterUrls = useCallback(async (bucket: string, chemins: string[]) => {
    const m = await urlsSignees(bucket, chemins)
    setUrls((u) => new Map([...u, ...m]))
  }, [])

  // Détails chargés à l'ouverture de la fiche et à chaque « Actualiser ».
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
  }, [ind?.projet.id, donnees?.chargeLe]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ind) return <main className="page"><p>Ce bâtiment n'existe pas ou a été supprimé. <Link to="/">Retour au tableau de bord</Link></p></main>
  const pr = ind.projet
  const agents = new Map((detail?.agents ?? []).map((a) => [a.id, a.nom]))
  const photoBat = pr.photo_path ? urls.get(pr.photo_path) : undefined

  const fiche: Fiche = {
    ind, p, niveaux, locaux, constats, derogations, detail, urls, ajouterUrls, agents, edition, modifier,
    majDetail: (f) => setDetail((d) => (d ? f(d) : d)),
  }

  return (
    <ContexteFiche.Provider value={fiche}>
      <main className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/">← Tableau de bord</Link>
        </div>
        {edition && (
          <p className="bandeau-edition">
            Vos modifications sont enregistrées tout de suite sur le serveur. La tablette les reçoit à sa prochaine synchronisation :
            synchronisez-la <b>avant de partir</b> sur le terrain, et <b>en rentrant</b> avant de corriger ici.
          </p>
        )}
        <section className="carte entete-fiche">
          {photoBat ? <img src={photoBat} alt={`Photo de ${pr.nom}`} /> : <div className="vignette-vide">{pr.photo_path ? 'Chargement…' : 'Pas de photo'}</div>}
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <h1>{pr.nom}</h1>
              <span className={`etiquette e-${ind.statut}`}>{LIBELLE_STATUT_ERP[ind.statut]}</span>
              {edition && <button className="bouton petit" onClick={() => setModifProjet(true)}>Modifier la fiche</button>}
            </div>
            <dl className="infos">
              <div><dt>Adresse</dt><dd>{pr.adresse || '—'}</dd></div>
              <div><dt>Commune déléguée</dt><dd>{pr.commune_deleguee || '—'}</dd></div>
              <div><dt>Code patrimoine</dt><dd>{pr.code || '—'}</dd></div>
              <div><dt>Contact</dt><dd>{pr.contact || '—'}</dd></div>
              {ind.diagnostic && <div><dt>Classement ERP</dt><dd>{ind.diagnostic.type_erp ? `Type ${ind.diagnostic.type_erp}${ind.diagnostic.activites_secondaires?.length ? ` (+ ${ind.diagnostic.activites_secondaires.join(', ')})` : ''}` : 'Type non renseigné'}{ind.diagnostic.categorie ? ` — ${ind.diagnostic.categorie}e catégorie` : ''}</dd></div>}
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

        {onglet === 'synthese' && <Synthese />}
        {onglet === 'batiment' && <Batiment />}
        {onglet === 'releves' && <Releves />}
        {onglet === 'accessibilite' && <Accessibilite />}
        {onglet === 'plans' && <Plans />}
      </main>
      <DialogueProjet ouvert={modifProjet} fermer={() => setModifProjet(false)} projet={pr} />
    </ContexteFiche.Provider>
  )
}
