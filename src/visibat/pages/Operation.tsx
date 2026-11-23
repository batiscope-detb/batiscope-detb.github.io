import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useVisibat } from '../contexte'
import { enregistrer, modifier, supprimer, type Dossier, type Intervenant, type Lot } from '../donnees'
import { ORDRE_CATEGORIES, TYPES_INTERVENANT, libelleType } from '../regles'
import { useDossier } from '../useDossier'
import FicheContact, { nomComplet } from '../composants/FicheContact'
import Entete, { Onglets } from '../composants/Entete'
import { Champ, Dialogue, executer, signaler } from '../../composants/Ui'
import { dateFr, dateHeureFr, depuisSaisie, versSaisie } from '../ui'
import { GestionPlans } from '../composants/Plans'
import { useUrls } from '../useUrls'

type Onglet = 'reunions' | 'intervenants' | 'lots' | 'plans' | 'fiche'

export default function PageOperation() {
  const { id } = useParams()
  const { dossier, erreur, recharger } = useDossier(id)
  const [onglet, setOnglet] = useState<Onglet>('reunions')
  const urls = useUrls(dossier)
  if (erreur) return <main className="page"><p className="erreur">{erreur}</p></main>
  if (!dossier) return <div className="chargement"><span className="roue" />Chargement…</div>
  const op = dossier.operation
  return (
    <main className="page">
      <Entete fil={[{ lien: `/visibat/operation/${op.id}`, libelle: op.nom }]} titre={op.nom} sousTitre={[op.objet, op.adresse].filter(Boolean).join(' · ') || undefined}>
        {op.projet_id && <Link className="bouton" to={`/erp/${op.projet_id}`}>Fiche du bâtiment</Link>}
      </Entete>
      <Onglets valeur={onglet} changer={setOnglet} choix={[['reunions', 'Réunions'], ['intervenants', 'Intervenants'], ['lots', 'Lots'], ['plans', 'Plans'], ['fiche', 'Fiche opération']]} />
      {onglet === 'reunions' && <Reunions dossier={dossier} />}
      {onglet === 'intervenants' && <Intervenants dossier={dossier} recharger={recharger} />}
      {onglet === 'lots' && <Lots dossier={dossier} recharger={recharger} />}
      {onglet === 'plans' && <GestionPlans dossier={dossier} recharger={recharger} urls={urls} />}
      {onglet === 'fiche' && <Fiche dossier={dossier} recharger={recharger} />}
    </main>
  )
}

function Reunions({ dossier }: { dossier: Dossier }) {
  const navigate = useNavigate()
  const [creation, setCreation] = useState(false)
  const derniere = dossier.reunions[dossier.reunions.length - 1]
  const [f, setF] = useState({ numero: '', date: '', lieu: 'Sur site' })

  function ouvrir() {
    setF({ numero: String((derniere?.numero ?? 0) + 1), date: versSaisie(derniere?.prochaine_date ?? new Date().toISOString()), lieu: derniere?.prochaine_lieu ?? derniere?.lieu ?? 'Sur site' })
    setCreation(true)
  }

  async function creer() {
    const numero = Number(f.numero)
    const r = await executer(async () => {
      if (!Number.isInteger(numero) || numero < 1) throw new Error('Numéro de réunion invalide.')
      if (dossier.reunions.some((x) => x.numero === numero)) throw new Error(`La réunion n° ${numero} existe déjà.`)
      const r = await enregistrer('reunion', { operation_id: dossier.operation.id, numero, date_reunion: depuisSaisie(f.date) ?? new Date().toISOString(), lieu: f.lieu || null })
      // Liste de présence : on reprend les convocations de la réunion précédente (ou la convocation par défaut).
      const precedentes = derniere ? dossier.presences.filter((p) => p.reunion_id === derniere.id) : []
      for (const i of dossier.intervenants) {
        const avant = precedentes.find((p) => p.intervenant_id === i.id)
        await enregistrer('presence', { reunion_id: r.id, intervenant_id: i.id, etat: null, convoque: avant ? avant.convoque : i.convoque_defaut })
      }
      return r
    }, `Réunion n° ${numero} créée`)
    if (r) navigate(`/visibat/operation/${dossier.operation.id}/reunion/${r.id}`)
  }

  return <>
    <div><button type="button" className="bouton primaire" onClick={ouvrir}>+ Nouvelle réunion</button></div>
    {dossier.reunions.length === 0 && <p className="vide">Pas encore de réunion. Pour un chantier déjà commencé, donnez à la première réunion le numéro suivant celui de votre dernier CR.</p>}
    <div className="vb-cartes">
      {[...dossier.reunions].reverse().map((r) => {
        const nb = dossier.observations.filter((o) => o.reunion_id === r.id).length
        return (
          <Link key={r.id} to={`/visibat/operation/${dossier.operation.id}/reunion/${r.id}`} className="vb-carte">
            <strong style={{ fontSize: 16 }}>Réunion n° {r.numero}</strong>
            <span>{dateHeureFr(r.date_reunion)} · {r.lieu}</span>
            <span className="vb-discret">{nb} nouvelle{nb > 1 ? 's' : ''} observation{nb > 1 ? 's' : ''} · {r.statut === 'diffusee' ? `diffusé le ${dateFr(r.diffusee_le)}` : r.statut === 'cloturee' ? 'clôturée' : 'en cours'}</span>
          </Link>)
      })}
    </div>
    <Dialogue titre="Nouvelle réunion" ouvert={creation} fermer={() => setCreation(false)} valider={creer} libelleValider="Créer">
      <div className="pile">
        <div className="grille-2">
          <Champ libelle="Numéro"><input className="champ" type="number" min={1} value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} /></Champ>
          <Champ libelle="Date et heure"><input className="champ" type="datetime-local" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Champ>
        </div>
        <Champ libelle="Lieu"><input className="champ" value={f.lieu} onChange={(e) => setF({ ...f, lieu: e.target.value })} /></Champ>
        <p className="vb-discret">Les intervenants convoqués à la réunion précédente sont repris, et les observations non soldées sont reportées automatiquement.</p>
      </div>
    </Dialogue>
  </>
}

function Intervenants({ dossier, recharger }: { dossier: Dossier; recharger: () => Promise<void> }) {
  const { contacts } = useVisibat()
  const [ajout, setAjout] = useState(false)
  const [nouveauContact, setNouveauContact] = useState(false)
  const [f, setF] = useState({ contact_id: '', categorie: 'entreprise', lot_id: '' })
  const [filtre, setFiltre] = useState('')

  const deja = new Set(dossier.intervenants.map((i) => i.contact_id))
  const choix = contacts.filter((c) => !deja.has(c.id)).filter((c) => !filtre || `${c.nom} ${c.prenom ?? ''} ${c.societe ?? ''}`.toLowerCase().includes(filtre.toLowerCase()))

  async function ajouter() {
    if (!f.contact_id) return signaler('Choisissez un contact.', 'erreur')
    const ok = await executer(async () => {
      const i = await enregistrer('intervenant', { operation_id: dossier.operation.id, contact_id: f.contact_id, categorie: f.categorie, lot_id: f.lot_id || null, ordre: dossier.intervenants.length })
      for (const r of dossier.reunions.filter((x) => x.statut === 'brouillon')) await enregistrer('presence', { reunion_id: r.id, intervenant_id: i.id, etat: null, convoque: true })
      return true
    }, 'Intervenant ajouté')
    if (ok) { await recharger(); setAjout(false); setF({ contact_id: '', categorie: 'entreprise', lot_id: '' }); setFiltre('') }
  }

  const parCategorie = ORDRE_CATEGORIES.map((cat) => ({ cat, liste: dossier.intervenants.filter((i) => i.categorie === cat) })).filter((g) => g.liste.length)
  return <>
    <div className="vb-barre">
      <button type="button" className="bouton primaire" onClick={() => setAjout(true)}>+ Ajouter depuis le carnet</button>
      <button type="button" className="bouton" onClick={() => setNouveauContact(true)}>+ Nouveau contact</button>
    </div>
    {dossier.intervenants.length === 0 && <p className="vide">Aucun intervenant. Ajoutez les entreprises, la MOE, le bureau de contrôle, le CSPS…</p>}
    {parCategorie.map((g) => (
      <section key={g.cat} className="vb-rubrique">
        <header><h2>{libelleType(g.cat)}</h2></header>
        <div className="carte tableau-conteneur"><table className="tableau">
          <thead><tr><th>Intervenant</th><th>Lot</th><th>Téléphone</th><th>E-mail</th><th>Reçoit le CR</th><th></th></tr></thead>
          <tbody>{g.liste.map((i) => <LigneIntervenant key={i.id} i={i} dossier={dossier} recharger={recharger} />)}</tbody>
        </table></div>
      </section>))}
    <Dialogue titre="Ajouter un intervenant" ouvert={ajout} fermer={() => setAjout(false)} valider={ajouter} libelleValider="Ajouter">
      <div className="pile">
        <input className="champ" type="search" placeholder="Rechercher dans le carnet…" aria-label="Rechercher dans le carnet" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
        <Champ libelle="Contact">
          <select className="champ" size={7} value={f.contact_id}
            onChange={(e) => { const c = contacts.find((x) => x.id === e.target.value); setF({ ...f, contact_id: e.target.value, categorie: c?.type_intervenant ?? f.categorie }) }}>
            {choix.map((c) => <option key={c.id} value={c.id}>{nomComplet(c)}{c.societe ? ` — ${c.societe}` : ''}</option>)}
          </select>
        </Champ>
        <div className="grille-2">
          <Champ libelle="Rôle sur l'opération">
            <select className="champ" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>
              {TYPES_INTERVENANT.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
            </select>
          </Champ>
          <Champ libelle="Lot">
            <select className="champ" value={f.lot_id} onChange={(e) => setF({ ...f, lot_id: e.target.value })}>
              <option value="">—</option>
              {dossier.lots.map((l) => <option key={l.id} value={l.id}>{l.code} {l.libelle}</option>)}
            </select>
          </Champ>
        </div>
      </div>
    </Dialogue>
    <FicheContact contact={null} ouvert={nouveauContact} fermer={() => setNouveauContact(false)} apres={(c) => { setF({ ...f, contact_id: c.id, categorie: c.type_intervenant }); setAjout(true) }} />
  </>
}

function LigneIntervenant({ i, dossier, recharger }: { i: Intervenant; dossier: Dossier; recharger: () => Promise<void> }) {
  const { contacts } = useVisibat()
  const c = contacts.find((x) => x.id === i.contact_id)
  const maj = async (champs: Record<string, unknown>) => { if (await executer(() => modifier('intervenant', i.id, champs).then(() => true))) await recharger() }
  return (
    <tr>
      <td><strong>{nomComplet(c)}</strong><div className="vb-discret">{[c?.fonction, c?.societe].filter(Boolean).join(' · ')}</div></td>
      <td><select className="champ petit" value={i.lot_id ?? ''} aria-label="Lot" onChange={(e) => maj({ lot_id: e.target.value || null })}>
        <option value="">—</option>{dossier.lots.map((l) => <option key={l.id} value={l.id}>{l.code} {l.libelle}</option>)}
      </select></td>
      <td style={{ whiteSpace: 'nowrap' }}>{c?.mobile ?? c?.telephone}</td>
      <td>{c?.email}</td>
      <td><label className="case"><input type="checkbox" checked={i.diffusion} onChange={(e) => maj({ diffusion: e.target.checked })} />Oui</label></td>
      <td><button type="button" className="bouton petit danger" onClick={async () => {
        if (confirm('Retirer cet intervenant de l’opération ?') && await executer(() => supprimer('intervenant', i.id).then(() => true), 'Intervenant retiré')) await recharger()
      }}>Retirer</button></td>
    </tr>)
}

const COULEURS = ['#8d6e63', '#e57373', '#90a4ae', '#a1887f', '#4db6ac', '#64b5f6', '#ba68c8', '#ffb74d', '#fdd835', '#81c784', '#f06292', '#7986cb']

function Lots({ dossier, recharger }: { dossier: Dossier; recharger: () => Promise<void> }) {
  const [f, setF] = useState({ code: '', libelle: '' })
  const maj = async (l: Lot, champs: Record<string, unknown>) => { if (await executer(() => modifier('lot', l.id, champs).then(() => true))) await recharger() }
  async function ajouter() {
    if (!f.code.trim() || !f.libelle.trim()) return signaler('Indiquez le code et l’intitulé du lot.', 'erreur')
    const ok = await executer(() => enregistrer('lot', { operation_id: dossier.operation.id, code: f.code.trim(), libelle: f.libelle.trim(), couleur: COULEURS[dossier.lots.length % COULEURS.length], ordre: dossier.lots.length }))
    if (ok) { setF({ code: '', libelle: '' }); await recharger() }
  }
  return (
    <section className="carte tableau-conteneur">
      <table className="tableau">
        <thead><tr><th>Code</th><th>Lot</th><th>Marché, engagement</th><th>Couleur</th><th></th></tr></thead>
        <tbody>
          {dossier.lots.map((l) => (
            <tr key={l.id}>
              <td style={{ width: 90 }}><input className="champ petit" defaultValue={l.code} aria-label="Code du lot" onBlur={(e) => e.target.value !== l.code && maj(l, { code: e.target.value })} /></td>
              <td><input className="champ petit" style={{ width: '100%' }} defaultValue={l.libelle} aria-label="Intitulé du lot" onBlur={(e) => e.target.value !== l.libelle && maj(l, { libelle: e.target.value })} /></td>
              <td><input className="champ petit" style={{ width: '100%' }} defaultValue={l.marche ?? ''} placeholder="Marché … du …, notifié le … · AP…" aria-label="Marché" onBlur={(e) => e.target.value !== (l.marche ?? '') && maj(l, { marche: e.target.value || null })} /></td>
              <td><input type="color" defaultValue={l.couleur ?? '#90a4ae'} aria-label="Couleur du lot" onBlur={(e) => maj(l, { couleur: e.target.value })} /></td>
              <td><button type="button" className="bouton petit danger" onClick={async () => {
                if (confirm('Supprimer ce lot ?') && await executer(() => supprimer('lot', l.id).then(() => true), 'Lot supprimé')) await recharger()
              }}>Supprimer</button></td>
            </tr>))}
          <tr>
            <td><input className="champ petit" placeholder="08" value={f.code} aria-label="Code du nouveau lot" onChange={(e) => setF({ ...f, code: e.target.value })} /></td>
            <td><input className="champ petit" style={{ width: '100%' }} placeholder="Couverture, étanchéité" value={f.libelle} aria-label="Intitulé du nouveau lot" onChange={(e) => setF({ ...f, libelle: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && ajouter()} /></td>
            <td colSpan={3}><button type="button" className="bouton" onClick={ajouter}>+ Ajouter le lot</button></td>
          </tr>
        </tbody>
      </table>
    </section>)
}

function Fiche({ dossier, recharger }: { dossier: Dossier; recharger: () => Promise<void> }) {
  const { moi, groupes, membres } = useVisibat()
  const op = dossier.operation
  const mesGroupes = groupes.filter((g) => g.id === op.groupe_id || membres.some((m) => m.groupe_id === g.id && m.agent_id === moi.id))
  const maj = async (champs: Record<string, unknown>) => { if (await executer(() => modifier('operation', op.id, champs).then(() => true), 'Enregistré')) await recharger() }
  const texte = (k: 'nom' | 'objet' | 'adresse', l: string) => (
    <Champ libelle={l}><input className="champ" defaultValue={op[k] ?? ''} onBlur={(e) => e.target.value !== (op[k] ?? '') && maj({ [k]: e.target.value || (k === 'nom' ? op.nom : null) })} /></Champ>)
  return (
    <section className="carte pile" style={{ maxWidth: 820 }}>
      {texte('nom', 'Nom')}{texte('objet', 'Objet des travaux')}{texte('adresse', 'Adresse')}
      <div className="grille-2">
        <Champ libelle="Début des travaux"><input className="champ" type="date" defaultValue={op.debut_travaux ?? ''} onBlur={(e) => maj({ debut_travaux: e.target.value || null })} /></Champ>
        <Champ libelle="Objectif de réception"><input className="champ" type="date" defaultValue={op.objectif_reception ?? ''} onBlur={(e) => maj({ objectif_reception: e.target.value || null })} /></Champ>
      </div>
      <div className="grille-2">
        <Champ libelle="Pénalité par absence non excusée (€ HT, CCAP)"><input className="champ" type="number" min={0} step={10} defaultValue={op.penalite_absence ?? ''} onBlur={(e) => maj({ penalite_absence: e.target.value === '' ? null : Number(e.target.value) })} /></Champ>
        <Champ libelle="Partage">
          <select className="champ" value={op.groupe_id ?? ''} onChange={(e) => maj({ groupe_id: e.target.value || null })}>
            <option value="">Projet personnel</option>
            {mesGroupes.map((g) => <option key={g.id} value={g.id}>Groupe : {g.nom}</option>)}
          </select>
        </Champ>
      </div>
      <Champ libelle="Clause de diffusion (en fin de liste des intervenants)">
        <textarea className="champ" rows={3} defaultValue={op.clause_diffusion ?? ''} onBlur={(e) => maj({ clause_diffusion: e.target.value || null })} />
      </Champ>
      <label className="case"><input type="checkbox" checked={op.archive} onChange={(e) => maj({ archive: e.target.checked })} />Opération archivée (chantier terminé)</label>
    </section>)
}
