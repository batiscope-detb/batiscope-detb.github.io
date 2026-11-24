import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { supabase } from '../donnees'
import { ContexteVisibat, directionDe } from './contexte'
import { lireAffectations, lireAgents, lireContacts, lireDirections, lireGroupes, lireStatuts, type Affectation, type Agent, type Contact, type Direction, type Groupe, type GroupeMembre, type Statut } from './donnees'
import Chantiers from './pages/Chantiers'
import Carnet from './pages/Carnet'
import PageOperation from './pages/Operation'
import PageReunion from './pages/Reunion'
import Impression from './pages/Impression'
import EtatHorsLigne from './composants/EtatHorsLigne'
import { demarrerSynchro } from './horsligne'
import './visibat.css'

/** Utilisateur de la dernière session gardée par le navigateur (hors ligne, quand le jeton a expiré). */
function utilisateurStocke(): { id: string } | null {
  try { return (JSON.parse(localStorage.getItem('releves-detb-bureau') ?? 'null')?.user as { id: string } | undefined) ?? null } catch { return null }
}

/** Module Visibat (visites et comptes rendus de chantier) dans Batiscope : routes /visibat/… */
export default function Visibat() {
  const [moi, setMoi] = useState<Agent | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groupes, setGroupes] = useState<{ groupes: Groupe[]; membres: GroupeMembre[] }>({ groupes: [], membres: [] })
  const [directions, setDirections] = useState<Direction[]>([])
  const [affectations, setAffectations] = useState<Affectation[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  const rechargerContacts = useCallback(async () => setContacts(await lireContacts()), [])
  const rechargerReferentiels = useCallback(async () => {
    const [s, g, d, a] = await Promise.all([lireStatuts(), lireGroupes(), lireDirections(), lireAffectations()])
    setStatuts(s); setGroupes(g); setDirections(d); setAffectations(a)
  }, [])

  // Dans Visibat, « Ajouter à l'écran d'accueil » installe l'icône Visibat (ouverture directe sur les chantiers).
  useEffect(() => {
    const lien = document.getElementById('manifeste') as HTMLLinkElement | null
    const titre = document.title
    lien?.setAttribute('href', './visibat.webmanifest')
    document.title = 'Visibat'
    return () => { lien?.setAttribute('href', './manifest.webmanifest'); document.title = titre }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        demarrerSynchro()
        // Session lue sur l'appareil (getUser interrogerait le serveur, impossible hors ligne).
        // Hors ligne, getSession peut rester en attente (verrou d'authentification) : délai de garde, puis session gardée.
        const session = await Promise.race([
          supabase.auth.getSession().then((r) => r.data.session).catch(() => null),
          new Promise<null>((ok) => setTimeout(() => ok(null), navigator.onLine ? 8000 : 1500)),
        ])
        const data = { user: session?.user ?? utilisateurStocke() }
        const [ag] = await Promise.all([lireAgents(), rechargerReferentiels(), rechargerContacts()])
        setAgents(ag)
        setMoi(ag.find((a) => a.id === data.user?.id) ?? null)
      } catch (e) { setErreur((e as Error).message) }
    })()
  }, [rechargerContacts, rechargerReferentiels])

  if (erreur) return <main className="page"><p className="erreur">Impossible de charger Visibat : {erreur}</p></main>
  if (!moi) return <div className="chargement"><span className="roue" />Chargement de Visibat…</div>
  return (
    <ContexteVisibat.Provider value={{
      moi, agents, statuts, contacts, groupes: groupes.groupes, membres: groupes.membres, directions, affectations,
      maDirection: directionDe({ directions, affectations }, moi.id) ?? directions[0] ?? null, rechargerContacts, rechargerReferentiels,
    }}>
      <Routes>
        <Route index element={<Chantiers />} />
        <Route path="carnet" element={<Carnet />} />
        <Route path="operation/:id" element={<PageOperation />} />
        <Route path="operation/:id/reunion/:reunionId" element={<PageReunion />} />
        <Route path="operation/:id/reunion/:reunionId/impression" element={<Impression />} />
        <Route path="*" element={<main className="page"><p>Page introuvable. <Link to="/visibat">Retour à Visibat</Link></p></main>} />
      </Routes>
      <EtatHorsLigne />
    </ContexteVisibat.Provider>
  )
}
