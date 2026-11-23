import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVisibat } from '../contexte'
import { enregistrer, lireBatiments, lireOperations, lireToutesReunions, type Operation, type Reunion } from '../donnees'
import { Champ, Dialogue, executer } from '../../composants/Ui'
import Entete from '../composants/Entete'
import { dateHeureFr } from '../ui'

type Vue = 'miens' | 'groupe' | 'tous'
const lireVue = (): Vue => { try { return (localStorage.getItem('visibat-vue') as Vue) || 'miens' } catch { return 'miens' } }
const CLAUSE = 'Le présent compte rendu est transmis par e-mail à l’ensemble des entreprises. La non-réception d’observations écrites au sujet du présent procès-verbal dans un délai de huit jours sera considérée comme une acceptation pleine et entière de tous les destinataires.'

/** Accueil de Visibat : les opérations (chantiers) de l'agent, de ses groupes ou de toute la DETB. */
export default function Chantiers() {
  const { moi, groupes, membres } = useVisibat()
  const navigate = useNavigate()
  const [ops, setOps] = useState<Operation[] | null>(null)
  const [reunions, setReunions] = useState<Reunion[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [vue, setVue] = useState<Vue>(lireVue)
  const [archives, setArchives] = useState(false)
  const [creation, setCreation] = useState(false)

  useEffect(() => {
    Promise.all([lireOperations(), lireToutesReunions()]).then(([o, r]) => { setOps(o); setReunions(r) }).catch((e: Error) => setErreur(e.message))
  }, [])

  const mesGroupes = useMemo(() => new Set(membres.filter((m) => m.agent_id === moi.id).map((m) => m.groupe_id)), [membres, moi.id])
  const visibles = (ops ?? []).filter((o) => o.archive === archives).filter((o) =>
    vue === 'tous' ? true : vue === 'miens' ? o.proprietaire_id === moi.id : !!o.groupe_id && mesGroupes.has(o.groupe_id))
  const derniere = (id: string) => reunions.filter((r) => r.operation_id === id).sort((a, b) => b.numero - a.numero)[0]
  const choisir = (v: Vue) => { setVue(v); try { localStorage.setItem('visibat-vue', v) } catch { /* indisponible */ } }

  return (
    <main className="page">
      <Entete titre="Visibat" sousTitre="Visites et comptes rendus de chantier">
        <Link className="bouton" to="/visibat/carnet">Carnet d’adresses</Link>
        <button type="button" className="bouton primaire" onClick={() => setCreation(true)}>+ Nouvelle opération</button>
      </Entete>
      <div className="vb-barre">
        <div className="vb-puces" role="group" aria-label="Opérations affichées">
          <button type="button" className="vb-puce" aria-pressed={vue === 'miens'} onClick={() => choisir('miens')}>Mes projets</button>
          <button type="button" className="vb-puce" aria-pressed={vue === 'groupe'} onClick={() => choisir('groupe')}>Projets du groupe</button>
          <button type="button" className="vb-puce" aria-pressed={vue === 'tous'} onClick={() => choisir('tous')}>Toute la DETB</button>
        </div>
        <label className="case"><input type="checkbox" checked={archives} onChange={(e) => setArchives(e.target.checked)} />Opérations archivées</label>
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
      {!ops && !erreur && <div className="chargement"><span className="roue" />Chargement…</div>}
      {ops && visibles.length === 0 && <p className="vide">
        {vue === 'groupe' && mesGroupes.size === 0 ? 'Vous ne faites partie d’aucun groupe : rejoignez-en un dans Paramètres › Visibat.' : 'Aucune opération ici pour l’instant.'}
      </p>}
      <div className="vb-cartes">
        {visibles.map((o) => {
          const r = derniere(o.id)
          const g = groupes.find((x) => x.id === o.groupe_id)
          return (
            <Link key={o.id} to={`/visibat/operation/${o.id}`} className="vb-carte">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ flex: 1, fontSize: 16 }}>{o.nom}</strong>
                <span className="etiquette" style={{ background: 'var(--pale)', color: 'var(--violet)' }}>{g ? g.nom : 'Personnel'}</span>
              </div>
              {o.objet && <span className="vb-discret">{o.objet}</span>}
              <span style={{ fontSize: 13, color: 'var(--violet-3)', fontWeight: 600 }}>
                {r ? `Dernière réunion n° ${r.numero} · ${dateHeureFr(r.date_reunion)}` : 'Aucune réunion'}
                {r?.prochaine_date ? ` · prochaine le ${dateHeureFr(r.prochaine_date)}` : ''}
              </span>
            </Link>)
        })}
      </div>
      <NouvelleOperation ouvert={creation} fermer={() => setCreation(false)} apres={(id) => navigate(`/visibat/operation/${id}`)} />
    </main>
  )
}

function NouvelleOperation({ ouvert, fermer, apres }: { ouvert: boolean; fermer: () => void; apres: (id: string) => void }) {
  const { moi, groupes, membres } = useVisibat()
  const [batiments, setBatiments] = useState<Awaited<ReturnType<typeof lireBatiments>>>([])
  const vide = { nom: '', objet: '', adresse: '', projet_id: '', groupe_id: '', debut_travaux: '', objectif_reception: '' }
  const [f, setF] = useState(vide)
  useEffect(() => { if (ouvert) { setF(vide); lireBatiments().then(setBatiments).catch(() => setBatiments([])) } }, [ouvert]) // eslint-disable-line react-hooks/exhaustive-deps
  const mesGroupes = groupes.filter((g) => membres.some((m) => m.groupe_id === g.id && m.agent_id === moi.id))

  async function creer() {
    if (!f.nom.trim()) throw new Error('Le nom est obligatoire.')
    const o = await executer(() => enregistrer('operation', {
      nom: f.nom.trim(), objet: f.objet || null, adresse: f.adresse || null, projet_id: f.projet_id || null, proprietaire_id: moi.id,
      groupe_id: f.groupe_id || null, debut_travaux: f.debut_travaux || null, objectif_reception: f.objectif_reception || null, clause_diffusion: CLAUSE,
    }), 'Opération créée')
    if (o) { fermer(); apres(o.id) }
  }

  return (
    <Dialogue titre="Nouvelle opération" ouvert={ouvert} fermer={fermer} valider={() => executer(creer)} libelleValider="Créer">
      <div className="pile">
        <Champ libelle="Bâtiment du patrimoine Batiscope" aide="Facultatif : un chantier hors patrimoine (bâtiment neuf, site extérieur…) se saisit librement ci-dessous. Le rattachement peut se faire plus tard dans la fiche opération.">
          <select className="champ" value={f.projet_id} onChange={(e) => {
            const b = batiments.find((x) => x.id === e.target.value)
            setF({ ...f, projet_id: e.target.value, nom: f.nom || b?.nom || '', adresse: f.adresse || b?.adresse || '' })
          }}>
            <option value="">— Hors patrimoine Batiscope (saisie libre) —</option>
            {batiments.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </Champ>
        <Champ libelle="Nom de l'opération *"><input className="champ" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
        <Champ libelle="Objet des travaux"><input className="champ" value={f.objet} onChange={(e) => setF({ ...f, objet: e.target.value })} placeholder="Travaux d’aménagement et de mise en conformité…" /></Champ>
        <Champ libelle="Adresse"><input className="champ" value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></Champ>
        <div className="grille-2">
          <Champ libelle="Début des travaux"><input className="champ" type="date" value={f.debut_travaux} onChange={(e) => setF({ ...f, debut_travaux: e.target.value })} /></Champ>
          <Champ libelle="Objectif de réception"><input className="champ" type="date" value={f.objectif_reception} onChange={(e) => setF({ ...f, objectif_reception: e.target.value })} /></Champ>
        </div>
        <Champ libelle="Partage">
          <select className="champ" value={f.groupe_id} onChange={(e) => setF({ ...f, groupe_id: e.target.value })}>
            <option value="">Projet personnel</option>
            {mesGroupes.map((g) => <option key={g.id} value={g.id}>Groupe : {g.nom}</option>)}
          </select>
        </Champ>
      </div>
    </Dialogue>
  )
}
