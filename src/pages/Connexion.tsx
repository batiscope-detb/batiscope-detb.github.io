import { useState, type FormEvent } from 'react'
import { supabase } from '../donnees'

export default function Connexion() {
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnCours(true); setErreur(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: mdp })
    setEnCours(false)
    if (error) setErreur(error.message.includes('Invalid login') ? 'Adresse ou mot de passe incorrect.' : error.message)
  }

  return (
    <div className="connexion">
      <form onSubmit={valider}>
        <img src={`${import.meta.env.BASE_URL}batiscope.svg`} alt="" className="logo-connexion" />
        <h1 style={{ textAlign: 'center', fontSize: 26, margin: 0, letterSpacing: -0.5 }}>Batiscope</h1>
        <p className="sous-titre" style={{ textAlign: 'center', margin: '-8px 0 0' }}>Relevés et accessibilité des bâtiments<br /><small>Direction Études et Travaux Bâtiments — même compte que sur la tablette</small></p>
        <label>Adresse électronique
          <input className="champ" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>Mot de passe
          <input className="champ" type="password" autoComplete="current-password" required value={mdp} onChange={(e) => setMdp(e.target.value)} />
        </label>
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
        <button className="bouton primaire" style={{ justifyContent: 'center' }} disabled={enCours}>{enCours ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </div>
  )
}
