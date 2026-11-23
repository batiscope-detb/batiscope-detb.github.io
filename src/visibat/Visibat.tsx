import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { supabase } from '../donnees'
import { ContexteVisibat } from './contexte'
import { lireAgents, lireContacts, lireGroupes, lireStatuts, type Agent, type Contact, type Groupe, type GroupeMembre, type Statut } from './donnees'
import Chantiers from './pages/Chantiers'
import Carnet from './pages/Carnet'
import PageOperation from './pages/Operation'
import PageReunion from './pages/Reunion'
import Impression from './pages/Impression'
import './visibat.css'

/** Module Visibat (visites et comptes rendus de chantier) dans Batiscope : routes /visibat/… */
export default function Visibat() {
  const [moi, setMoi] = useState<Agent | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groupes, setGroupes] = useState<{ groupes: Groupe[]; membres: GroupeMembre[] }>({ groupes: [], membres: [] })
  const [erreur, setErreur] = useState<string | null>(null)

  const rechargerContacts = useCallback(async () => setContacts(await lireContacts()), [])
  const rechargerReferentiels = useCallback(async () => {
    const [s, g] = await Promise.all([lireStatuts(), lireGroupes()])
    setStatuts(s); setGroupes(g)
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const [ag] = await Promise.all([lireAgents(), rechargerReferentiels(), rechargerContacts()])
        setAgents(ag)
        setMoi(ag.find((a) => a.id === data.user?.id) ?? null)
      } catch (e) { setErreur((e as Error).message) }
    })()
  }, [rechargerContacts, rechargerReferentiels])

  if (erreur) return <main className="page"><p className="erreur">Impossible de charger Visibat : {erreur}</p></main>
  if (!moi) return <div className="chargement"><span className="roue" />Chargement de Visibat…</div>
  return (
    <ContexteVisibat.Provider value={{ moi, agents, statuts, contacts, groupes: groupes.groupes, membres: groupes.membres, rechargerContacts, rechargerReferentiels }}>
      <Routes>
        <Route index element={<Chantiers />} />
        <Route path="carnet" element={<Carnet />} />
        <Route path="operation/:id" element={<PageOperation />} />
        <Route path="operation/:id/reunion/:reunionId" element={<PageReunion />} />
        <Route path="operation/:id/reunion/:reunionId/impression" element={<Impression />} />
        <Route path="*" element={<main className="page"><p>Page introuvable. <Link to="/visibat">Retour à Visibat</Link></p></main>} />
      </Routes>
    </ContexteVisibat.Provider>
  )
}
