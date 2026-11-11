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

interface Donnees { patrimoine: Patrimoine; indicateurs: IndicateursErp[]; chargeLe: Date }
interface Ctx { donnees: Donnees | null; erreur: string | null; recharger: () => void; nomAgent: string; modifier: (f: (p: Patrimoine) => Patrimoine) => void }
const ContexteDonnees = createContext<Ctx>({ donnees: null, erreur: null, recharger: () => {}, nomAgent: '', modifier: () => {} })
export const useDonnees = () => useContext(ContexteDonnees)

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [donnees, setDonnees] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [nomAgent, setNomAgent] = useState('')

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

  useEffect(() => {
    if (!session) { setDonnees(null); return }
    recharger()
    supabase.schema('releves').from('agent').select('id,nom').then(({ data }) => definirNomsAgents(new Map((data ?? []).map((a) => [a.id as string, a.nom as string]))))
    supabase.schema('releves').from('agent').select('nom').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setNomAgent((data?.nom as string | undefined) ?? session.user.email ?? ''))
  }, [session?.user.id, recharger]) // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <div className="chargement"><span className="roue" />Chargement…</div>
  if (!session) return <Connexion />

  const initiales = nomAgent.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase()).join('')
  return (
    <ContexteDonnees.Provider value={{ donnees, erreur, recharger, nomAgent, modifier }}>
      <header className="entete">
        <Link to="/" className="marque">
          <img src={`${import.meta.env.BASE_URL}embleme.png`} alt="" />
          <span><b>Relevés DETB</b><small>Ville de Cherbourg-en-Cotentin</small></span>
        </Link>
        <nav className="nav" aria-label="Navigation principale">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'actif' : '')}>Tableau de bord</NavLink>
          <NavLink to="/referentiel" className={({ isActive }) => (isActive ? 'actif' : '')}>Référentiel accessibilité</NavLink>
        </nav>
        <div className="compte">
          {donnees && <span title="Heure du dernier chargement">À jour à {donnees.chargeLe.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="lien-clair" onClick={recharger} title="Recharger les données du serveur">Actualiser</button>
          <span className="pastille" title={nomAgent}>{initiales || '?'}</span>
          <button className="lien-clair" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
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
      <footer className="pied">Direction de l'entretien et des travaux du bâtiment — appli bureau v{__VERSION__}</footer>
    </ContexteDonnees.Provider>
  )
}
