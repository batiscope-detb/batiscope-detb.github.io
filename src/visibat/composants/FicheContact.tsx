import { useEffect, useState } from 'react'
import { useVisibat } from '../contexte'
import { enregistrer, supprimer, type Contact } from '../donnees'
import { TYPES_INTERVENANT } from '../regles'
import { Champ, Dialogue, executer } from '../../composants/Ui'

const VIDE = { nom: '', prenom: '', fonction: '', societe: '', type_intervenant: 'entreprise', telephone: '', mobile: '', email: '', adresse: '', notes: '', siret: '' }

/** Création ou modification d'une fiche du carnet d'adresses. */
export default function FicheContact({ contact, ouvert, fermer, apres, typeParDefaut }: {
  contact: Contact | null; ouvert: boolean; fermer: () => void; apres?: (c: Contact) => void; typeParDefaut?: string
}) {
  const { rechargerContacts } = useVisibat()
  const [f, setF] = useState(VIDE)
  useEffect(() => {
    if (!ouvert) return
    setF(contact ? Object.fromEntries(Object.keys(VIDE).map((k) => [k, (contact as unknown as Record<string, string | null>)[k] ?? ''])) as typeof VIDE
      : { ...VIDE, type_intervenant: typeParDefaut ?? 'entreprise' })
  }, [ouvert, contact, typeParDefaut])

  const champ = (k: keyof typeof VIDE, libelle: string, type = 'text') => (
    <Champ libelle={libelle}><input className="champ" type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Champ>)

  async function valider() {
    if (!f.nom.trim()) return executer(async () => { throw new Error('Le nom est obligatoire.') })
    const ligne = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]))
    const c = await executer(() => enregistrer<Contact>('contact', { ...(contact ? { id: contact.id } : {}), ...ligne, nom: f.nom.trim(), type_intervenant: f.type_intervenant }), 'Contact enregistré')
    if (!c) return
    await rechargerContacts()
    fermer(); apres?.(c)
  }

  return (
    <Dialogue titre={contact ? 'Modifier le contact' : 'Nouveau contact'} ouvert={ouvert} fermer={fermer} valider={valider}
      danger={contact ? { libelle: 'Retirer du carnet', action: async () => {
        if (!confirm('Retirer ce contact du carnet ?')) return
        if (await executer(() => supprimer('contact', contact.id).then(() => true), 'Contact retiré')) { await rechargerContacts(); fermer() }
      } } : undefined}>
      <div className="pile">
        <Champ libelle="Type d'intervenant">
          <select className="champ" value={f.type_intervenant} onChange={(e) => setF({ ...f, type_intervenant: e.target.value })}>
            {TYPES_INTERVENANT.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
          </select>
        </Champ>
        <div className="grille-2">{champ('nom', 'Nom *')}{champ('prenom', 'Prénom')}</div>
        <div className="grille-2">{champ('fonction', 'Fonction')}{champ('societe', 'Société / service')}</div>
        <div className="grille-2">{champ('mobile', 'Mobile', 'tel')}{champ('telephone', 'Téléphone fixe', 'tel')}</div>
        {champ('email', 'E-mail', 'email')}
        <Champ libelle="Adresse" aide="Une ligne par ligne d’adresse (reprise dans les formulaires EXE)."><textarea className="champ" rows={2} value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></Champ>
        {f.type_intervenant === 'entreprise' && champ('siret', 'SIRET (formulaires EXE)')}
        <Champ libelle="Notes"><textarea className="champ" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Champ>
      </div>
    </Dialogue>
  )
}

export const nomComplet = (c?: Contact) => c ? [c.prenom, c.nom].filter(Boolean).join(' ') : '?'
