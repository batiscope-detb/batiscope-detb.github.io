import { useCallback, useEffect, useState, createContext, useContext } from 'react'
import { NavLink, Route, Routes, Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, chargerPatrimoine, type Patrimoine } from './donnees'
import { definirNomsAgents } from './ecriture'
import { indicateurs, type IndicateursErp } from './calculs'
import Connexion from './pages/Connexion'
import TableauDeBord from './pages/TableauDeBord'
import FicheErp from './pages/FicheErp'
import Referentiel from './pages/Referentiel'
import { Notifications } from './composants/Ui'
import { FormulaireMotDePasse, Parametres, type Moi } from './composants/Parametres'
import { reglages } from './reglages'

interface Donnees { patrimoine: Patrimoine; indicateurs: IndicateursErp[]; chargeLe: Date }
interface Ctx { donnees: Donnees | null; erreur: string | null; recharger: () => void; nomAgent: string; modifier: (f: (p: Patrimoine) => Patrimoine) => void; edition: boolean; role: string }
const ContexteDonnees = createContext<Ctx>({ donnees: null, erreur: null, recharger: () => {}, nomAgent: '', modifier: () => {}, edition: false, role: 'agent' })
export const useDonnees = () => useContext(ContexteDonnees)

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [donnees, setDonnees] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [nomAgent, setNomAgent] = useState('')
  const [profil, setProfil] = useState<{ role: string; actif: boolean } | null | undefined>(undefined)
  const [parametres, setParametres] = useState(false)
  const [edition, setEdition] = useState(reglages.editionParDefaut)
  const basculerEdition = () => { const v = !edition; setEdition(v); reglages.definirEdition(v) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const recharger = useCallback(() => {
    setErreur(null)
    chargerPatrimoine()
      .then((p) => setDonnees({ patrimoine: p, indicateurs: indicateurs(p), chargeLe: new Date() }))
      .catch((e: Error) => setErreur(e.message))
  }, [])

  /** Applique en mémoire le résultat d'une écriture (sans tout recharger). */
  const modifier = useCallback((f: (p: Patrimoine) => Patrimoine) => {
    setDonnees((d) => { if (!d) return d; const p = f(d.patrimoine); return { ...d, patrimoine: p, indicateurs: indicateurs(p) } })
  }, [])

  const provisoire = !!session?.user.user_metadata?.mdp_provisoire

  useEffect(() => {
    if (!session) { setDonnees(null); setProfil(undefined); return }
    supabase.schema('releves').from('agent').select('nom,role,actif').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => {
        setNomAgent((data?.nom as string | undefined) ?? session.user.email ?? '')
        setProfil(data ? { role: data.role as string, actif: !!data.actif } : null)
        if (data?.actif && !provisoire) {
          recharger()
          supabase.schema('releves').from('agent').select('id,nom').then(({ data: d }) => definirNomsAgents(new Map((d ?? []).map((a) => [a.id as string, a.nom as string]))))
        }
      })
  }, [session?.user.id, provisoire, recharger]) // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <div className="chargement"><span className="roue" />Chargement…</div>
  if (!session) return <Connexion />
  if (profil === undefined) return <div className="chargement"><span className="roue" />Chargement…</div>
  if (!profil?.actif) return (
    <div className="premiere-connexion"><div>
      <h1 style={{ fontSize: 20 }}>Compte non activé</h1>
      <p>Votre compte ({session.user.email}) n'a pas accès aux relevés. Demandez à un administrateur de la DETB de l'activer.</p>
      <div><button className="bouton" onClick={() => supabase.auth.signOut()}>Se déconnecter</button></div>
    </div></div>
  )
  if (provisoire) return (
    <div className="premiere-connexion"><div>
      <h1 style={{ fontSize: 20 }}>Bienvenue {nomAgent}</h1>
      <p>Vous vous connectez avec un mot de passe provisoire. Choisissez maintenant votre mot de passe personnel : il servira aussi sur la tablette.</p>
      <FormulaireMotDePasse titre="Mon mot de passe" apres={() => supabase.auth.refreshSession()} />
      <div><button className="bouton" onClick={() => supabase.auth.signOut()}>Se déconnecter</button></div>
      <Notifications />
    </div></div>
  )
  const moi: Moi = { id: session.user.id, nom: nomAgent, email: session.user.email ?? '', role: profil.role }

  const initiales = nomAgent.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase()).join('')
  return (
    <ContexteDonnees.Provider value={{ donnees, erreur, recharger, nomAgent, modifier, edition, role: profil?.role ?? 'agent' }}>
      <header className="entete">
        <button type="button" className="marque-bouton" onClick={() => setParametres(true)} title="Paramètres : compte, apparence, utilisateurs">
          <img src={`${import.meta.env.BASE_URL}embleme.png`} alt="" />
          <span><b>Relevés DETB</b><small>Ville de Cherbourg-en-Cotentin</small></span>
        </button>
        <nav className="nav" aria-label="Navigation principale">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'actif' : '')}>Tableau de bord</NavLink>
          <NavLink to="/referentiel" className={({ isActive }) => (isActive ? 'actif' : '')}>Référentiel accessibilité</NavLink>
        </nav>
        <div className="compte">
          <label className={`interrupteur clair${edition ? ' actif' : ''}`} title="Autorise les modifications (fiches, plans, relevés)">
            <input type="checkbox" checked={edition} onChange={basculerEdition} />
            <span className="glissiere" aria-hidden="true" />
            Modification
          </label>
          {donnees && <span title="Heure du dernier chargement">À jour à {donnees.chargeLe.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="lien-clair" onClick={recharger} title="Recharger les données du serveur">Actualiser</button>
          <button type="button" className="pastille" style={{ border: 'none', color: '#fff', cursor: 'pointer' }} title={`${nomAgent} — paramètres`} onClick={() => setParametres(true)}>{initiales || '?'}</button>
        </div>
      </header>
      {erreur && <main className="page"><p className="erreur">Impossible de charger les données : {erreur}</p></main>}
      {!donnees && !erreur && <div className="chargement"><span className="roue" />Chargement du patrimoine…</div>}
      {donnees && (
        <Routes>
          <Route path="/" element={<TableauDeBord />} />
          <Route path="/erp/:id" element={<FicheErp />} />
          <Route path="/referentiel" element={<Referentiel />} />
          <Route path="*" element={<main className="page"><p>Page introuvable. <Link to="/">Retour au tableau de bord</Link></p></main>} />
        </Routes>
      )}
      <Notifications />
      <Parametres ouvert={parametres} fermer={() => setParametres(false)} moi={moi} renommer={setNomAgent} />
      <footer className="pied">Direction Études et Travaux Bâtiments — appli bureau v{__VERSION__}</footer>
    </ContexteDonnees.Provider>
  )
}
