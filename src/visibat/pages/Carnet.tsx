import { useMemo, useState } from 'react'
import { useVisibat } from '../contexte'
import type { Contact } from '../donnees'
import { TYPES_INTERVENANT, libelleType } from '../regles'
import FicheContact, { nomComplet } from '../composants/FicheContact'
import Entete from '../composants/Entete'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Carnet d'adresses partagé par la DETB. */
export default function Carnet() {
  const { contacts } = useVisibat()
  const [type, setType] = useState('tous')
  const [q, setQ] = useState('')
  const [fiche, setFiche] = useState<{ contact: Contact | null } | null>(null)

  const liste = useMemo(() => contacts
    .filter((c) => type === 'tous' || c.type_intervenant === type)
    .filter((c) => !q || norm([c.nom, c.prenom, c.societe, c.fonction, c.email].join(' ')).includes(norm(q))), [contacts, type, q])
  const nb = (t: string) => t === 'tous' ? contacts.length : contacts.filter((c) => c.type_intervenant === t).length

  return (
    <main className="page">
      <Entete fil={[{ lien: '/visibat/carnet', libelle: 'Carnet d’adresses' }]} titre="Carnet d’adresses" sousTitre="Partagé par toute la DETB, réutilisé d’une opération à l’autre">
        <input className="champ" type="search" placeholder="Nom, société, fonction…" aria-label="Rechercher un contact" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="bouton primaire" onClick={() => setFiche({ contact: null })}>+ Contact</button>
      </Entete>
      <div className="vb-puces" role="group" aria-label="Type d’intervenant">
        <button type="button" className="vb-puce" aria-pressed={type === 'tous'} onClick={() => setType('tous')}>Tous · {nb('tous')}</button>
        {TYPES_INTERVENANT.map((t) => (
          <button key={t.code} type="button" className="vb-puce" aria-pressed={type === t.code} onClick={() => setType(t.code)}>{t.libelle} · {nb(t.code)}</button>))}
      </div>
      <section className="carte tableau-conteneur">
        <table className="tableau">
          <thead><tr><th>Contact</th><th>Type</th><th>Société / service</th><th>Téléphone</th><th>E-mail</th></tr></thead>
          <tbody>
            {liste.map((c) => (
              <tr key={c.id} className="cliquable" onClick={() => setFiche({ contact: c })}>
                <td><button type="button" style={{ all: 'unset', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setFiche({ contact: c }) }}>
                  <strong>{nomComplet(c)}</strong></button>{c.fonction && <div className="vb-discret">{c.fonction}</div>}</td>
                <td><span className="etiquette" style={{ background: 'var(--pale)', color: 'var(--violet)' }}>{libelleType(c.type_intervenant)}</span></td>
                <td>{c.societe}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{c.mobile ?? c.telephone}</td>
                <td>{c.email && <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a>}</td>
              </tr>))}
            {liste.length === 0 && <tr><td colSpan={5} className="vide">Aucun contact.</td></tr>}
          </tbody>
        </table>
      </section>
      <FicheContact contact={fiche?.contact ?? null} ouvert={!!fiche} fermer={() => setFiche(null)} />
    </main>
  )
}
