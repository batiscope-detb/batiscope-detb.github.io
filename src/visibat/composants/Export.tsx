import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Champ, Dialogue, executer, signaler } from '../../composants/Ui'
import { useVisibat } from '../contexte'
import { enregistrer, lireModeles, modifier, supprimer, type Dossier, type ModeleExport, type Reunion } from '../donnees'
import { emailOutlook, nomFichier, objetCR, corpsCR, construireEml, telecharger } from '../diffusion'
import { urlPhotoChantier } from '../useUrls'
import { LIBELLES, PALETTES, completer, observationsExport, parEntreprise, regrouper, type Reglages } from '../export/reglages'

/** Export et diffusion du CR : modèles (dernier utilisé, personnels, de groupe, pré-configurés), roue crantée, PDF, brouillon Outlook. */
export default function Export({ dossier, reunion, urls, recharger }: { dossier: Dossier; reunion: Reunion; urls: Map<string, string>; recharger: () => Promise<void> }) {
  const { moi, statuts, contacts, groupes, membres } = useVisibat()
  const navigate = useNavigate()
  const [modeles, setModeles] = useState<ModeleExport[]>([])
  const [choix, setChoix] = useState<string | null>(null)
  const [reglages, setReglages] = useState<Reglages | null>(null)
  const [roue, setRoue] = useState<ModeleExport | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  const charger = useCallback(async () => setModeles(await lireModeles()), [])
  useEffect(() => { executer(charger) }, [charger])

  const mesGroupes = new Set(membres.filter((m) => m.agent_id === moi.id).map((m) => m.groupe_id))
  const dernier = modeles.find((m) => m.portee === 'dernier' && m.proprietaire_id === moi.id)
  const sections: [string, ModeleExport[]][] = [
    ['Dernier modèle utilisé', dernier ? [dernier] : []],
    ['Mes modèles', modeles.filter((m) => m.portee === 'perso' && m.proprietaire_id === moi.id)],
    ['Modèles du groupe', modeles.filter((m) => m.portee === 'groupe' && m.groupe_id && mesGroupes.has(m.groupe_id))],
    ['Modèles pré-configurés', modeles.filter((m) => m.portee === 'systeme')],
  ]
  const choisi = modeles.find((m) => m.id === choix) ?? dernier ?? modeles.find((m) => m.portee === 'systeme')
  const actifs = reglages ?? completer(choisi?.reglages)

  async function memoriser(r: Reglages) {
    if (dernier) await modifier('modele_export', dernier.id, { reglages: r })
    else await enregistrer('modele_export', { nom: 'Dernières préférences d’export', portee: 'dernier', proprietaire_id: moi.id, reglages: r, ordre: 0 })
    charger()
  }
  async function pdf(r: Reglages, destinataire?: { nom: string; observations: ReturnType<typeof observationsExport> }) {
    const { genererPdf } = await import('../export/pdf')
    const obs = destinataire?.observations ?? observationsExport(dossier, reunion, statuts, r)
    const photoCouverture = r.garde ? await urlPhotoChantier(dossier.operation).catch(() => null) : null
    return genererPdf({ dossier, reunion, reglages: r, statuts, contacts, urls, redacteur: moi.nom, observations: obs, rubriques: regrouper(dossier, obs, contacts, statuts, r), destinataire: destinataire?.nom, photoCouverture })
  }
  const nomPdf = (suffixe = '') => `CR ${reunion.numero} - ${nomFichier(dossier.operation.nom)}${suffixe}.pdf`
  const destinataires = dossier.intervenants.filter((i) => i.diffusion).map((i) => contacts.find((c) => c.id === i.contact_id)?.email).filter((x): x is string => !!x)

  async function lancer(action: 'pdf' | 'outlook' | 'entreprises') {
    setEnCours(action)
    await executer(async () => {
      const r = actifs
      if (action === 'entreprises') {
        const { default: JSZip } = await import('jszip')
        const zip = new JSZip()
        const obs = observationsExport(dossier, reunion, statuts, r)
        const liste = parEntreprise(dossier, obs, contacts)
        if (!liste.length) throw new Error('Aucune entreprise concernée par les observations retenues.')
        for (const e of liste) {
          const b = new Uint8Array(await (await pdf(r, e)).arrayBuffer())
          const nom = nomPdf(` - ${nomFichier(e.nom)}`)
          zip.file(nom, b)
          zip.file(`${nomFichier(e.nom)}.eml`, construireEml(e.emails, `${objetCR(dossier, reunion)} — ${e.nom}`, corpsCR(dossier, reunion, moi.nom), [{ nom, contenu: b, type: 'application/pdf' }]))
        }
        telecharger(`CR ${reunion.numero} - extraits par entreprise.zip`, await zip.generateAsync({ type: 'blob' }))
        signaler(`${liste.length} extrait${liste.length > 1 ? 's' : ''} préparé${liste.length > 1 ? 's' : ''} (PDF et brouillons Outlook)`)
      } else {
        const b = await pdf(r)
        if (action === 'pdf') telecharger(nomPdf(), b)
        else {
          if (!destinataires.length) throw new Error('Aucun destinataire : cochez « Reçoit le CR » pour des intervenants ayant une adresse e-mail.')
          emailOutlook(dossier, reunion, destinataires, moi.nom, [{ nom: nomPdf(), contenu: new Uint8Array(await b.arrayBuffer()), type: 'application/pdf' }])
          await modifier('reunion', reunion.id, { statut: 'diffusee', diffusee_le: new Date().toISOString() })
          await recharger()
          signaler('Brouillon Outlook prêt (PDF joint) : ouvrez le fichier .eml téléchargé')
        }
      }
      await memoriser(r)
      return true
    })
    setEnCours(null)
  }

  return (
    <section className="carte pile" style={{ maxWidth: 980 }}>
      <h2 style={{ margin: 0 }}>Export et diffusion du compte rendu</h2>
      {sections.filter(([, l]) => l.length).map(([titre, liste]) => (
        <div key={titre} className="pile" style={{ gap: 6 }}>
          <div className="vb-discret" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 11 }}>{titre}</div>
          {liste.map((m) => (
            <div key={m.id} className="vb-modele">
              <button type="button" className="vb-modele-choix" aria-pressed={choisi?.id === m.id} onClick={() => { setChoix(m.id); setReglages(null) }}>
                <strong>{m.nom}</strong>
                <span className="vb-discret">{m.description ?? resume(completer(m.reglages))}{m.portee === 'groupe' && m.groupe_id ? ` · ${groupes.find((g) => g.id === m.groupe_id)?.nom ?? ''}` : ''}</span>
              </button>
              <button type="button" className="vb-roue" onClick={() => { setChoix(m.id); setRoue(m) }} aria-label={`Personnaliser : ${m.nom}`} title="Personnaliser">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
              </button>
            </div>))}
        </div>))}
      {reglages && <p className="vb-discret" style={{ margin: 0 }}>Réglages personnalisés pour cet export : {resume(reglages)}.</p>}
      <div className="vb-barre">
        <button type="button" className="bouton" onClick={() => navigate(`/visibat/operation/${dossier.operation.id}/reunion/${reunion.id}/impression`, { state: { reglages: actifs } })}>Aperçu, impression et Word</button>
        <button type="button" className="bouton" disabled={!!enCours} onClick={() => lancer('pdf')}>{enCours === 'pdf' ? 'Préparation…' : 'Télécharger le PDF'}</button>
        <button type="button" className="bouton primaire" disabled={!!enCours} onClick={() => lancer('outlook')}>{enCours === 'outlook' ? 'Préparation…' : 'Préparer l’e-mail Outlook (PDF joint)'}</button>
        {actifs.par_entreprise && <button type="button" className="bouton" disabled={!!enCours} onClick={() => lancer('entreprises')}>{enCours === 'entreprises' ? 'Préparation…' : 'Extraits par entreprise (.zip)'}</button>}
      </div>
      <p className="vb-discret" style={{ margin: 0 }}>
        {destinataires.length} destinataire{destinataires.length > 1 ? 's' : ''} en copie cachée. Le fichier .eml téléchargé s’ouvre dans Outlook comme un nouveau message, PDF joint : relisez puis envoyez depuis votre adresse.
        {reunion.diffusee_le && ` Dernière diffusion préparée le ${new Date(reunion.diffusee_le).toLocaleDateString('fr-FR')}.`}
      </p>
      {roue && <RoueCrantee modele={roue} initial={reglages ?? completer(roue.reglages)} fermer={() => setRoue(null)}
        appliquer={(r) => { setReglages(r); setRoue(null) }}
        enregistrer={async (r, nom, groupeId) => {
          const ok = await executer(() => enregistrer('modele_export', { nom, portee: groupeId ? 'groupe' : 'perso', proprietaire_id: moi.id, groupe_id: groupeId, reglages: r, ordre: 10 }), groupeId ? 'Modèle partagé avec le groupe' : 'Modèle enregistré')
          if (ok) { await charger(); setChoix(ok.id); setReglages(null); setRoue(null) }
        }}
        mettreAJour={(roue.portee === 'perso' && roue.proprietaire_id === moi.id) || (roue.portee === 'groupe' && roue.groupe_id && mesGroupes.has(roue.groupe_id)) ? async (r) => {
          if (await executer(() => modifier('modele_export', roue.id, { reglages: r }).then(() => true), 'Modèle mis à jour')) { await charger(); setReglages(null); setRoue(null) }
        } : undefined}
        retirer={roue.portee !== 'systeme' && roue.portee !== 'dernier' && roue.proprietaire_id === moi.id ? async () => {
          if (confirm('Supprimer ce modèle ?') && await executer(() => supprimer('modele_export', roue.id).then(() => true), 'Modèle supprimé')) { await charger(); setChoix(null); setRoue(null) }
        } : undefined}
        groupes={groupes.filter((g) => mesGroupes.has(g.id))} planningDispo={dossier.operation.planning_actif} />}
    </section>
  )
}

const resume = (r: Reglages) => [LIBELLES.classement[r.classement], r.palette !== 'prune' ? PALETTES[r.palette].nom.toLowerCase() : '', LIBELLES.remarques[r.remarques].split(' (')[0].toLowerCase(), r.planning !== 'aucun' ? 'avec planning' : '', r.plans ? 'plans' : '', r.photos !== 'aucune' ? 'photos' : ''].filter(Boolean).join(' · ')

function RoueCrantee({ modele, initial, fermer, appliquer, enregistrer, mettreAJour, retirer, groupes, planningDispo }: {
  modele: ModeleExport; initial: Reglages; fermer: () => void; appliquer: (r: Reglages) => void
  enregistrer: (r: Reglages, nom: string, groupeId: string | null) => Promise<void>; mettreAJour?: (r: Reglages) => Promise<void>; retirer?: () => Promise<void>
  groupes: { id: string; nom: string }[]; planningDispo: boolean
}) {
  const [r, setR] = useState<Reglages>(initial)
  const [nom, setNom] = useState('')
  const [groupe, setGroupe] = useState('')
  const choixListe = <K extends 'remarques' | 'classement' | 'planning' | 'photos'>(k: K, libelle: string) => (
    <Champ libelle={libelle}>
      <select className="champ" value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })}>
        {Object.entries(LIBELLES[k]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Champ>)
  const caseR = (k: 'garde' | 'presences' | 'generales' | 'plans' | 'memoire' | 'par_entreprise', libelle: string) => (
    <label className="case"><input type="checkbox" checked={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.checked })} />{libelle}</label>)
  return (
    <Dialogue large titre={`Personnaliser : ${modele.nom}`} ouvert fermer={fermer} valider={() => appliquer(r)} libelleValider="Utiliser pour cet export"
      danger={retirer ? { libelle: 'Supprimer le modèle', action: retirer } : undefined}>
      <div className="pile">
        <div className="grille-2">{choixListe('remarques', 'Remarques incluses')}{choixListe('classement', 'Classement')}</div>
        <div className="champ-form"><span>Couleurs du document</span>
          <div className="vb-puces" role="radiogroup" aria-label="Couleurs du document">
            {(Object.keys(PALETTES) as Reglages['palette'][]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={r.palette === k} className="vb-puce vb-palette" aria-pressed={r.palette === k} onClick={() => setR({ ...r, palette: k })}>
                <span className="vb-nuance" style={{ background: PALETTES[k].fonce }} /><span className="vb-nuance" style={{ background: PALETTES[k].pale }} />{PALETTES[k].nom}
              </button>))}
          </div>
        </div>
        <div className="grille-2">{choixListe('photos', 'Photos')}{planningDispo ? choixListe('planning', 'Planning') : <p className="vb-discret">Planning : activez-le dans l’onglet Planning de l’opération pour pouvoir le joindre.</p>}</div>
        <div className="grille-2" style={{ gap: '4px 16px' }}>
          {caseR('garde', 'Page de garde')}{caseR('presences', 'Intervenants et présences')}
          {caseR('generales', 'Remarques générales')}{caseR('memoire', 'Points « pour mémoire »')}
          {caseR('plans', 'Plans avec pastilles et annotations')}{caseR('par_entreprise', 'Proposer les extraits par entreprise')}
        </div>
        {mettreAJour && <div><button type="button" className="bouton" onClick={() => mettreAJour(r)}>Mettre à jour ce modèle</button></div>}
        <div className="carte pile" style={{ padding: 12, gap: 8 }}>
          <strong>Enregistrer comme nouveau modèle</strong>
          <div className="grille-2">
            <Champ libelle="Nom du modèle"><input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="CR CEC — DETB" /></Champ>
            <Champ libelle="Visible par">
              <select className="champ" value={groupe} onChange={(e) => setGroupe(e.target.value)}>
                <option value="">Moi seulement</option>
                {groupes.map((g) => <option key={g.id} value={g.id}>Groupe : {g.nom}</option>)}
              </select>
            </Champ>
          </div>
          <div><button type="button" className="bouton" onClick={() => nom.trim() ? enregistrer(r, nom.trim(), groupe || null) : signaler('Donnez un nom au modèle.', 'erreur')}>Enregistrer le modèle</button></div>
        </div>
      </div>
    </Dialogue>
  )
}
