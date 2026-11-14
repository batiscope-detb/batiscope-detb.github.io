import { HistoriqueVeille } from '../veille'
import { Listes } from './Listes'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../donnees'
import { VERSION_REFERENTIEL } from '../moteur'
import { motDePasseProvisoire, reglages, type Taille, type Theme } from '../reglages'
import bibliotheque from '../data/symboles_plan.json'
import { Champ, Dialogue, executer, signaler } from './Ui'

export interface Moi { id: string; nom: string; email: string; role: string }
type Onglet = 'compte' | 'apparence' | 'utilisateurs' | 'listes' | 'veille' | 'apropos'

/** Fenêtre « Paramètres », ouverte par le logo (comme « À propos et réglages » sur la tablette). */
export function Parametres({ ouvert, fermer, moi, renommer }: { ouvert: boolean; fermer: () => void; moi: Moi; renommer: (nom: string) => void }) {
  const [onglet, setOnglet] = useState<Onglet>('compte')
  const admin = moi.role === 'admin'
  const onglets: { id: Onglet; libelle: string }[] = [
    { id: 'compte', libelle: 'Mon compte' }, { id: 'apparence', libelle: 'Apparence' },
    ...(admin ? [{ id: 'utilisateurs' as Onglet, libelle: 'Utilisateurs' }, { id: 'listes' as Onglet, libelle: 'Listes' }] : []), { id: 'veille', libelle: 'Veille réglementaire' }, { id: 'apropos', libelle: 'À propos' },
  ]
  return (
    <Dialogue titre="Paramètres" ouvert={ouvert} fermer={fermer} large>
      <div className="onglets" role="tablist" style={{ marginTop: -6 }}>
        {onglets.map((o) => <button key={o.id} type="button" role="tab" aria-selected={onglet === o.id} onClick={() => setOnglet(o.id)}>{o.libelle}</button>)}
      </div>
      {onglet === 'compte' && <Compte moi={moi} renommer={renommer} />}
      {onglet === 'apparence' && <Apparence />}
      {onglet === 'utilisateurs' && admin && <Utilisateurs moi={moi} />}
      {onglet === 'listes' && admin && <Listes />}
      {onglet === 'veille' && <HistoriqueVeille admin={admin} />}
      {onglet === 'apropos' && <APropos />}
    </Dialogue>
  )
}

function Compte({ moi, renommer }: { moi: Moi; renommer: (nom: string) => void }) {
  const [nom, setNom] = useState(moi.nom)
  async function enregistrerNom() {
    if (!nom.trim() || nom.trim() === moi.nom) return
    const r = await executer(async () => {
      const { error } = await supabase.schema('releves').from('agent').update({ nom: nom.trim() }).eq('id', moi.id)
      if (error) throw new Error(error.message)
      return true
    }, 'Nom enregistré')
    if (r) renommer(nom.trim())
  }
  return (
    <div className="pile">
      <div className="grille-2">
        <Champ libelle="Nom affiché" aide="Repris dans les rapports (« Établi par ») et l'historique des modifications.">
          <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} onBlur={enregistrerNom} />
        </Champ>
        <Champ libelle="Adresse de connexion"><input className="champ" value={moi.email} readOnly /></Champ>
      </div>
      <p className="note-param">Rôle : <b>{moi.role === 'admin' ? 'Administrateur' : 'Agent'}</b></p>
      <FormulaireMotDePasse />
      <div><button type="button" className="bouton danger" onClick={() => supabase.auth.signOut()}>Se déconnecter</button></div>
    </div>
  )
}

/** Changement du mot de passe (aussi utilisé à la première connexion avec un mot de passe provisoire). */
export function FormulaireMotDePasse({ apres, titre = 'Changer mon mot de passe' }: { apres?: () => void; titre?: string }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [enCours, setEnCours] = useState(false)
  async function valider(e?: FormEvent) {
    e?.preventDefault()
    if (a.length < 10) return signaler('Le mot de passe doit faire au moins 10 caractères.', 'erreur')
    if (a !== b) return signaler('Les deux saisies ne correspondent pas.', 'erreur')
    setEnCours(true)
    const r = await executer(async () => {
      const { error } = await supabase.auth.updateUser({ password: a, data: { mdp_provisoire: false } })
      if (error) throw new Error(error.message.includes('different') ? 'Choisissez un mot de passe différent de l’actuel.' : error.message)
      return true
    }, 'Mot de passe modifié')
    setEnCours(false)
    if (r) { setA(''); setB(''); apres?.() }
  }
  return (
    <fieldset className="cadre-param">
      <legend>{titre}</legend>
      <div className="grille-2">
        <Champ libelle="Nouveau mot de passe" aide="10 caractères minimum."><input className="champ" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></Champ>
        <Champ libelle="Confirmation"><input className="champ" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); valider() } }} /></Champ>
      </div>
      <div><button type="button" className="bouton primaire" disabled={enCours || !a} onClick={() => valider()}>{enCours ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button></div>
    </fieldset>
  )
}

function Apparence() {
  const [theme, setTheme] = useState<Theme>(reglages.theme)
  const [taille, setTaille] = useState<Taille>(reglages.taille)
  const [edition, setEdition] = useState(reglages.editionParDefaut)
  const choix = <T extends string>(nom: string, valeur: T, courant: T, libelle: string, maj: (v: T) => void) => (
    <label className={`choix${courant === valeur ? ' actif' : ''}`}><input type="radio" name={nom} checked={courant === valeur} onChange={() => maj(valeur)} />{libelle}</label>
  )
  return (
    <div className="pile">
      <fieldset className="cadre-param"><legend>Thème</legend>
        <div className="choix-ligne">
          {choix('theme', 'systeme', theme, 'Comme Windows', (v) => { setTheme(v); reglages.definirTheme(v) })}
          {choix('theme', 'clair', theme, 'Clair', (v) => { setTheme(v); reglages.definirTheme(v) })}
          {choix('theme', 'sombre', theme, 'Sombre', (v) => { setTheme(v); reglages.definirTheme(v) })}
          {choix('theme', 'sepia', theme, 'Sépia (liseuse)', (v) => { setTheme(v); reglages.definirTheme(v) })}
        </div>
      </fieldset>
      <fieldset className="cadre-param"><legend>Taille du texte</legend>
        <div className="choix-ligne">
          {choix('taille', 'normal', taille, 'Normale', (v) => { setTaille(v); reglages.definirTaille(v) })}
          {choix('taille', 'grand', taille, 'Grande', (v) => { setTaille(v); reglages.definirTaille(v) })}
          {choix('taille', 'tres-grand', taille, 'Très grande', (v) => { setTaille(v); reglages.definirTaille(v) })}
        </div>
      </fieldset>
      <label className="case"><input type="checkbox" checked={edition} onChange={(e) => { setEdition(e.target.checked); reglages.definirEdition(e.target.checked) }} />
        Ouvrir les fiches en « Mode modification »</label>
      <p className="note-param">Ces réglages sont propres à ce poste.</p>
    </div>
  )
}

interface AgentListe { id: string; nom: string; email: string | null; role: string; actif: boolean; derniere_connexion: string | null; mdp_provisoire: boolean }

async function appeler(corps: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('gerer-agents', { body: corps })
  if (error) {
    let message = error.message
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.erreur) message = j.erreur } catch { /* réponse non JSON */ }
    throw new Error(message)
  }
  return data as { agents?: AgentListe[]; ok?: boolean }
}

function Utilisateurs({ moi }: { moi: Moi }) {
  const [liste, setListe] = useState<AgentListe[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [nouveau, setNouveau] = useState(false)
  const [secret, setSecret] = useState<{ nom: string; email: string; mdp: string } | null>(null)
  const charger = useCallback(() => {
    setErreur(null)
    appeler({ action: 'lister' }).then((d) => setListe(d.agents ?? [])).catch((e: Error) => setErreur(e.message))
  }, [])
  useEffect(charger, [charger])

  async function modifier(a: AgentListe, maj: Partial<AgentListe>, message: string) {
    const r = await executer(() => appeler({ action: 'modifier', id: a.id, ...maj }), message)
    if (r) charger()
  }
  async function reinitialiser(a: AgentListe) {
    const mdp = motDePasseProvisoire()
    const r = await executer(() => appeler({ action: 'reinitialiser', id: a.id, motDePasse: mdp }), 'Mot de passe réinitialisé')
    if (r) { setSecret({ nom: a.nom, email: a.email ?? '', mdp }); charger() }
  }

  if (erreur) return <p className="erreur">{erreur}</p>
  if (!liste) return <div className="chargement" style={{ padding: 30 }}><span className="roue" />Chargement des comptes…</div>
  return (
    <div className="pile">
      {secret && <MotDePasseAffiche {...secret} fermer={() => setSecret(null)} />}
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead><tr><th>Agent</th><th>Rôle</th><th>Actif</th><th>Dernière connexion</th><th /></tr></thead>
          <tbody>{liste.map((a) => (
            <tr key={a.id} style={a.actif ? undefined : { opacity: 0.6 }}>
              <td><b>{a.nom}</b>{a.id === moi.id && ' (vous)'}<div style={{ fontSize: 12, color: 'var(--encre-2)' }}>{a.email}</div>
                {a.mdp_provisoire && <span className="etiquette e-ambre" style={{ marginTop: 4 }}>Mot de passe provisoire</span>}</td>
              <td><select className="champ petit" value={a.role} disabled={a.id === moi.id} aria-label={`Rôle de ${a.nom}`}
                onChange={(e) => modifier(a, { role: e.target.value }, 'Rôle modifié')}>
                <option value="agent">Agent</option><option value="admin">Administrateur</option></select></td>
              <td><label className="case"><input type="checkbox" checked={a.actif} disabled={a.id === moi.id}
                onChange={(e) => modifier(a, { actif: e.target.checked }, e.target.checked ? 'Compte réactivé' : 'Compte désactivé')} />{a.actif ? 'Oui' : 'Non'}</label></td>
              <td style={{ whiteSpace: 'nowrap' }}>{a.derniere_connexion ? new Date(a.derniere_connexion).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Jamais'}</td>
              <td style={{ textAlign: 'right' }}>{a.id !== moi.id && <button type="button" className="bouton petit" onClick={() => reinitialiser(a)}>Nouveau mot de passe</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {nouveau ? <NouvelAgent fermer={() => setNouveau(false)} cree={(s) => { setSecret(s); setNouveau(false); charger() }} />
        : <div><button type="button" className="bouton primaire" onClick={() => setNouveau(true)}>+ Nouvel agent</button></div>}
      <p className="note-param">Un compte désactivé ne peut plus se connecter, ni au bureau ni sur la tablette. Ses relevés restent en place.</p>
    </div>
  )
}

function NouvelAgent({ fermer, cree }: { fermer: () => void; cree: (s: { nom: string; email: string; mdp: string }) => void }) {
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('agent')
  const [enCours, setEnCours] = useState(false)
  async function valider() {
    if (!nom.trim() || !email.trim()) return signaler('Indiquez le nom et l’adresse électronique.', 'erreur')
    const mdp = motDePasseProvisoire()
    setEnCours(true)
    const r = await executer(() => appeler({ action: 'creer', nom: nom.trim(), email: email.trim(), role, motDePasse: mdp }), 'Compte créé')
    setEnCours(false)
    if (r) cree({ nom: nom.trim(), email: email.trim().toLowerCase(), mdp })
  }
  return (
    <fieldset className="cadre-param">
      <legend>Nouvel agent</legend>
      <div className="grille-2">
        <Champ libelle="Nom et prénom"><input className="champ" autoFocus value={nom} onChange={(e) => setNom(e.target.value)} /></Champ>
        <Champ libelle="Adresse électronique"><input className="champ" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@cherbourg.fr" /></Champ>
      </div>
      <Champ libelle="Rôle"><select className="champ" value={role} onChange={(e) => setRole(e.target.value)}><option value="agent">Agent</option><option value="admin">Administrateur</option></select></Champ>
      <p className="note-param">Un mot de passe provisoire est généré ; l'agent devra le changer à sa première connexion.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="bouton" onClick={fermer}>Annuler</button>
        <button type="button" className="bouton primaire" disabled={enCours} onClick={valider}>{enCours ? 'Création…' : 'Créer le compte'}</button>
      </div>
    </fieldset>
  )
}

function MotDePasseAffiche({ nom, email, mdp, fermer }: { nom: string; email: string; mdp: string; fermer: () => void }) {
  const [copie, setCopie] = useState(false)
  return (
    <div className="secret" role="alert">
      <b>Mot de passe provisoire de {nom}</b>
      <div className="secret-valeur"><code>{mdp}</code>
        <button type="button" className="bouton petit" onClick={() => navigator.clipboard?.writeText(mdp).then(() => setCopie(true)).catch(() => {})}>{copie ? 'Copié' : 'Copier'}</button></div>
      <span>Identifiant : {email}. Transmettez ce mot de passe à l'agent de vive voix ou par un message séparé de l'identifiant. Il ne sera plus affiché après fermeture.</span>
      <div><button type="button" className="bouton petit" onClick={fermer}>J'ai transmis le mot de passe</button></div>
    </div>
  )
}

function APropos() {
  return (
    <div className="pile" style={{ alignItems: 'center', textAlign: 'center' }}>
      <img src={`${import.meta.env.BASE_URL}batiscope.svg`} alt="Batiscope" style={{ height: 88 }} />
      <div><b style={{ fontSize: 18 }}>Batiscope — appli bureau</b><br />Relevés d'état et diagnostics d'accessibilité<br />Direction Études et Travaux Bâtiments<br />Ville de Cherbourg-en-Cotentin</div>
      <table className="tableau" style={{ maxWidth: 520, textAlign: 'left' }}><tbody>
        <tr><td>Version</td><td>{__VERSION__}</td></tr>
        <tr><td>Référentiel accessibilité</td><td>{VERSION_REFERENTIEL}</td></tr>
        <tr><td>Bibliothèque de symboles</td><td>{(bibliotheque as { version: string }).version} ({(bibliotheque as { symboles: unknown[] }).symboles.length} symboles et outils)</td></tr>
      </tbody></table>
    </div>
  )
}
