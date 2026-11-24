import { useEffect, useRef, useState } from 'react'
import { BoutonFichier, Dialogue, executer, signaler } from '../../composants/Ui'
import { Photos } from '../../composants/Photos'
import { preparerPhoto } from '../../ecriture'
import { useVisibat } from '../contexte'
import { BUCKET, enregistrer, modifier, supprimer, type Dossier, type Observation, type Reception } from '../donnees'
import { telecharger } from '../diffusion'
import { deposer } from '../horsligne'
import { CATEGORIES, ETAPES, TITRES, echeances, estVisible, formulairesDe, fr, valeur, type Champ, type CodeExe, type Donnees, type Etape } from '../reception/exe'
import { envoyerExe, genererExe, libelleCategorie, reservesDe, type Contexte } from '../reception/documents'
import { aujourdhui } from '../ui'
import { urlPhoto } from '../useUrls'
import { PlanReunion } from './Plans'
import { nomComplet } from './FicheContact'

/** Rappel du fonctionnement de la réception et des formulaires EXE (CCAG Travaux / FCS 2021). */
export function RappelReception({ ouvert = false }: { ouvert?: boolean }) {
  return (
    <details className="carte vb-rappel" open={ouvert}>
      <summary><strong>Comment fonctionne la réception ?</strong> <span className="vb-discret">Rappel du CCAG Travaux 2021 et des formulaires EXE</span></summary>
      <ol className="vb-rappel-etapes">
        <li><b>Avis d’achèvement.</b> Le titulaire avise par écrit le maître d’ouvrage et le maître d’œuvre de la date à laquelle il estime que les travaux sont, ou seront, achevés (art. 41.1).</li>
        <li><b>Opérations préalables à la réception — EXE4.</b> Le maître d’œuvre organise les OPR au plus tard 20 jours après cet avis, titulaire convoqué ; le maître d’ouvrage peut y assister. Le PV est dressé sur-le-champ et signé par le maître d’œuvre et le titulaire (art. 41.1 et 41.2).</li>
        <li><b>Propositions du maître d’œuvre — EXE5.</b> Dans les 5 jours suivant le PV : prononcer ou non la réception, date d’achèvement retenue, réserves éventuelles (art. 41.2).</li>
        <li><b>Décision du maître d’ouvrage — EXE6 (réception) ou EXE7 (non-réception).</b> Notifiée dans les 30 jours suivant le PV ; à défaut, les propositions du maître d’œuvre s’imposent. La réception prend effet à la date d’achèvement retenue (art. 41.3).
          <br /><span className="vb-discret">« Sous réserve » : épreuves ou travaux restant à exécuter. « Avec réserves » : malfaçons, pose, repli, remise en état. Pour une imperfection mineure, une réfaction peut remplacer la reprise (art. 41.7).</span></li>
        <li><b>Levée des réserves — EXE8 puis EXE9.</b> Le titulaire remédie aux réserves dans le délai fixé par la décision, sinon au plus tard 3 mois avant la fin du délai de garantie (art. 41.6). Le maître d’œuvre constate la levée (EXE8), puis propose et le maître d’ouvrage décide (EXE9).</li>
        <li><b>Garantie de parfait achèvement.</b> Un an à compter de la date d’effet de la réception (art. 44.1).</li>
        <li><b>Fournitures courantes — EXE3.</b> Pour un marché FCS, l’acheteur formalise l’admission après vérifications quantitatives et qualitatives : admission, ajournement, admission avec réfaction ou rejet.</li>
      </ol>
      <p className="vb-discret" style={{ margin: 0 }}>Délais en jours calendaires ; un délai qui expire un samedi, un dimanche ou un jour férié est prolongé jusqu’au premier jour ouvrable suivant. Les formulaires sont ceux de la DAJ ; un administrateur peut importer une nouvelle version dans Paramètres › Visibat.</p>
    </details>
  )
}

/** Onglet « Réception » d'une opération. */
export function ReceptionOperation({ dossier, recharger, urls }: { dossier: Dossier; recharger: () => Promise<void>; urls: Map<string, string> }) {
  const { moi } = useVisibat()
  const op = dossier.operation
  const [choisie, setChoisie] = useState<string | null>(null)
  const [nouvelle, setNouvelle] = useState(false)
  const r = dossier.receptions.find((x) => x.id === choisie) ?? dossier.receptions[0]

  if (!op.reception_actif) return (
    <div className="pile">
      <div className="carte pile" style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Module Réception (OPR et formulaires EXE)</h3>
        <p style={{ margin: 0 }}>Préparez les opérations préalables à la réception, relevez les réserves sur plan et en photo, suivez les délais et générez les formulaires EXE3 à EXE9 remplis.</p>
        <div><button type="button" className="bouton principal" onClick={async () => {
          if (await executer(() => modifier('operation', op.id, { reception_actif: true }).then(() => true), 'Module Réception activé')) await recharger()
        }}>Activer pour cette opération</button></div>
      </div>
      <RappelReception ouvert />
    </div>
  )

  return (
    <div className="pile">
      <RappelReception />
      <div className="vb-barre">
        <div className="vb-puces" role="tablist" aria-label="Réceptions">
          {dossier.receptions.map((x) => {
            const lot = dossier.lots.find((l) => l.id === x.lot_id)
            return <button key={x.id} type="button" className="vb-puce" aria-pressed={x.id === r?.id} onClick={() => setChoisie(x.id)}>
              {x.genre === 'fcs' ? 'Admission' : 'Réception'} {lot ? `lot ${lot.code}` : ''}{x.partielle ? ' (partielle)' : ''}
            </button>
          })}
        </div>
        <button type="button" className="bouton" onClick={() => setNouvelle(true)}>+ Nouvelle réception</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="bouton petit" onClick={async () => {
          if (confirm('Masquer le module Réception pour cette opération ? Les données restent conservées.') && await executer(() => modifier('operation', op.id, { reception_actif: false }).then(() => true))) await recharger()
        }}>Désactiver</button>
      </div>
      {!r && <p className="vide">Aucune réception. Créez-en une par lot (marché de travaux) ou par admission de fournitures (marché FCS).</p>}
      {r && <DetailReception key={r.id} dossier={dossier} reception={r} recharger={recharger} urls={urls} />}
      <NouvelleReception dossier={dossier} ouvert={nouvelle} fermer={() => setNouvelle(false)} moiId={moi.id}
        creee={async (id) => { await recharger(); setChoisie(id) }} />
    </div>
  )
}

function NouvelleReception({ dossier, ouvert, fermer, creee, moiId }: { dossier: Dossier; ouvert: boolean; fermer: () => void; creee: (id: string) => Promise<void>; moiId: string }) {
  const [genre, setGenre] = useState<'travaux' | 'fcs'>('travaux')
  const [lotId, setLotId] = useState('')
  useEffect(() => { if (ouvert) { setGenre('travaux'); setLotId(dossier.lots[0]?.id ?? '') } }, [ouvert, dossier.lots])
  return (
    <Dialogue titre="Nouvelle réception" ouvert={ouvert} fermer={fermer} libelleValider="Créer" valider={async () => {
      const lot = dossier.lots.find((l) => l.id === lotId)
      const titulaire = dossier.intervenants.find((i) => i.lot_id === lotId && i.categorie === 'entreprise')?.contact_id ?? null
      const r = await executer(() => enregistrer<Reception>('reception', {
        operation_id: dossier.operation.id, lot_id: lotId || null, genre, titulaire_contact_id: titulaire, moe_agent_id: moiId,
        numero_marche: lot?.marche ?? null, objet_marche: dossier.operation.objet ?? dossier.operation.nom, partielle: false,
        prestations: lot ? `Ensemble des prestations du lot ${lot.code} – ${lot.libelle}` : null, donnees: { lieu: dossier.operation.adresse ?? '' }, ordre: dossier.receptions.length,
      }), 'Réception créée')
      if (r) { fermer(); await creee(r.id) }
    }}>
      <div className="pile">
        <div className="vb-puces">
          <button type="button" className="vb-puce" aria-pressed={genre === 'travaux'} onClick={() => setGenre('travaux')}>Marché de travaux (EXE4 à EXE9)</button>
          <button type="button" className="vb-puce" aria-pressed={genre === 'fcs'} onClick={() => setGenre('fcs')}>Fournitures courantes (EXE3)</button>
        </div>
        <label className="champ-form">Lot (marché)
          <select className="champ" value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">— Sans lot —</option>
            {dossier.lots.map((l) => <option key={l.id} value={l.id}>Lot {l.code} – {l.libelle}</option>)}
          </select>
        </label>
        <p className="vb-discret" style={{ margin: 0 }}>Le titulaire est repris de l’entreprise affectée à ce lot ; tout reste modifiable dans la fiche du marché.</p>
      </div>
    </Dialogue>
  )
}

function DetailReception({ dossier, reception: r, recharger, urls }: { dossier: Dossier; reception: Reception; recharger: () => Promise<void>; urls: Map<string, string> }) {
  const ctxV = useVisibat()
  const { contacts, agents, directions, affectations, moi } = ctxV
  const [d, setD] = useState<Donnees>(r.donnees ?? {})
  const [reserve, setReserve] = useState<{ obs: Observation | null; position?: { planId: string; x: number; y: number } } | null>(null)
  const [vuePlan, setVuePlan] = useState(false)
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reserves = reservesDe(dossier, r.id)
  const obsReserves = dossier.reserves.filter((x) => x.reception_id === r.id)
  const lot = dossier.lots.find((l) => l.id === r.lot_id)
  const ctx: Contexte = { dossier, reception: { ...r, donnees: d }, contacts, agents, directions, affectations }

  // Enregistrement différé des choix (saisie fluide, hors ligne compris).
  const changer = (cle: string, v: string | boolean | undefined) => {
    const n = { ...d, [cle]: v }
    setD(n)
    if (minuterie.current) clearTimeout(minuterie.current)
    minuterie.current = setTimeout(() => { void modifier('reception', r.id, { donnees: n }).catch((e: Error) => signaler(e.message, 'erreur')) }, 700)
  }
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current) }, [])
  const maj = async (champs: Partial<Reception>) => { if (await executer(() => modifier('reception', r.id, champs).then(() => true))) await recharger() }

  async function document(code: CodeExe, outlook: boolean) {
    const g = await executer(async () => outlook ? envoyerExe(code, ctx, `${moi.nom}`) : genererExe(code, ctx))
    if (!g) return
    if (!outlook) telecharger(g.nom, g.fichier)
    signaler(outlook ? `Brouillon Outlook prêt (${code} joint)` : `${code} généré`)
    if (g.manquantes.length) signaler(`Modèle importé : ${g.manquantes.length} zone(s) non retrouvée(s), à compléter dans Word (${g.manquantes.slice(0, 2).join(' ; ')}…)`, 'erreur')
  }

  const ech = r.genre === 'travaux' ? echeances(d, reserves) : []
  const today = aujourdhui()
  const etatEch = (e: { date: string | null; faite: boolean }) => e.faite ? 'faite' : !e.date ? 'vide' : e.date < today ? 'retard' : e.date <= addDays(today, 7) ? 'proche' : 'avenir'
  const formulaires = formulairesDe(r.genre, d, reserves)

  return (
    <div className="pile">
      {/* Fiche du marché */}
      <details className="carte" open={!r.titulaire_contact_id || !r.numero_marche}>
        <summary style={{ padding: '10px 14px', cursor: 'pointer' }}>
          <strong>Marché{lot ? ` — Lot ${lot.code} ${lot.libelle}` : ''}</strong>{' '}
          <span className="vb-discret">{(() => { const t = contacts.find((c) => c.id === r.titulaire_contact_id); return t ? t.societe || nomComplet(t) : 'titulaire à renseigner' })()}{r.numero_marche ? ` · n° ${r.numero_marche}` : ''}</span>
        </summary>
        <div className="pile" style={{ padding: '0 14px 14px' }}>
          <div className="grille-2">
            <label className="champ-form">Lot
              <select className="champ" value={r.lot_id ?? ''} onChange={(e) => maj({ lot_id: e.target.value || null })}>
                <option value="">— Sans lot —</option>
                {dossier.lots.map((l) => <option key={l.id} value={l.id}>Lot {l.code} – {l.libelle}</option>)}
              </select></label>
            <label className="champ-form">Titulaire (carnet d’adresses)
              <select className="champ" value={r.titulaire_contact_id ?? ''} onChange={(e) => maj({ titulaire_contact_id: e.target.value || null })}>
                <option value="">—</option>
                {contacts.filter((c) => c.type_intervenant === 'entreprise' || c.id === r.titulaire_contact_id).map((c) => <option key={c.id} value={c.id}>{c.societe ? `${c.societe} (${nomComplet(c)})` : nomComplet(c)}</option>)}
              </select></label>
            <label className="champ-form">N° du marché<input className="champ" defaultValue={r.numero_marche ?? ''} onBlur={(e) => e.target.value !== (r.numero_marche ?? '') && maj({ numero_marche: e.target.value || null })} /></label>
            <label className="champ-form">Objet du marché<input className="champ" defaultValue={r.objet_marche ?? ''} onBlur={(e) => e.target.value !== (r.objet_marche ?? '') && maj({ objet_marche: e.target.value || null })} /></label>
            <label className="champ-form">Code postal et commune de l’opération<input className="champ" value={String(d.lieu ?? '')} onChange={(e) => changer('lieu', e.target.value)} /></label>
            <label className="champ-form">Maître d’œuvre (agent qui suit l’affaire)
              <select className="champ" value={r.moe_agent_id ?? ''} onChange={(e) => maj({ moe_agent_id: e.target.value || null })}>
                <option value="">—</option>
                {agents.filter((a) => a.actif).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select></label>
            <label className="champ-form">Lieu de signature<input className="champ" value={String(d.lieu_signature ?? 'Cherbourg-en-Cotentin')} onChange={(e) => changer('lieu_signature', e.target.value)} /></label>
            {r.genre === 'travaux' && <label className="champ-form" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={r.partielle} onChange={(e) => maj({ partielle: e.target.checked })} /> Réception partielle</label>}
          </div>
          <label className="champ-form">{r.genre === 'fcs' ? 'Objet de la décision' : 'Prestations concernées par la réception'}
            <textarea className="champ" rows={2} defaultValue={r.prestations ?? ''} onBlur={(e) => e.target.value !== (r.prestations ?? '') && maj({ prestations: e.target.value || null })} /></label>
          {(() => {
            const t = contacts.find((c) => c.id === r.titulaire_contact_id)
            const manque = [!t?.adresse && 'adresse', !t?.siret && 'SIRET', !t?.email && 'mail'].filter(Boolean)
            return t && manque.length ? <p className="vb-discret" style={{ margin: 0 }}>Fiche du titulaire incomplète ({manque.join(', ')}) : complétez-la dans le carnet d’adresses pour remplir le bloc B des formulaires.</p> : null
          })()}
          <div><button type="button" className="bouton petit danger" onClick={async () => {
            if (!confirm('Supprimer cette réception et ses réserves ?')) return
            const ok = await executer(async () => { for (const o of obsReserves) await supprimer('observation', o.id); await supprimer('reception', r.id); return true }, 'Réception supprimée')
            if (ok) await recharger()
          }}>Supprimer la réception</button></div>
        </div>
      </details>

      {/* Échéances */}
      {r.genre === 'travaux' && <div className="vb-frise" aria-label="Échéances de la réception">
        {ech.map((e) => <div key={e.cle} className={`vb-ech ${etatEch(e)}`} title={e.aide}>
          <span className="vb-ech-point" aria-hidden="true">{e.faite ? '✓' : ''}</span>
          <span className="vb-ech-libelle">{e.libelle}</span>
          <span className="vb-ech-date">{e.date ? `${e.faite ? '' : etatEch(e) === 'retard' ? 'dépassé : ' : 'avant le '}${fr(e.date)}` : '—'}</span>
        </div>)}
      </div>}

      {/* Réserves */}
      {r.genre === 'travaux' && <section className="carte pile" style={{ padding: 14, gap: 10 }}>
        <div className="vb-barre" style={{ margin: 0 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Réserves <span className="vb-discret">({reserves.filter((x) => !x.soldee_le).length} à lever sur {reserves.length})</span></h3>
          <button type="button" className="bouton" onClick={() => setVuePlan(!vuePlan)} aria-pressed={vuePlan}>{vuePlan ? 'Masquer le plan' : 'Plan des réserves'}</button>
          <button type="button" className="bouton principal" onClick={() => setReserve({ obs: null })}>+ Réserve</button>
        </div>
        {vuePlan && <PlanReunion dossier={dossier} observations={obsReserves} urls={urls} recharger={recharger}
          poser={(planId, x, y) => setReserve({ obs: null, position: { planId, x, y } })} ouvrir={(o) => setReserve({ obs: o })} />}
        {reserves.length === 0 ? <p className="vb-discret" style={{ margin: 0 }}>Aucune réserve. Ajoutez-les pendant la visite (sur le plan ou ici) ; elles alimentent les annexes et les cases des formulaires.</p>
          : <div className="tableau-conteneur"><table className="tableau vb-fixe">
            <colgroup><col style={{ width: 54 }} /><col style={{ width: 130 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 110 }} /></colgroup>
            <thead><tr><th>N°</th><th>Nature</th><th>Désignation</th><th>À lever avant</th><th>Levée le</th></tr></thead>
            <tbody>{obsReserves.map((o) => (
              <tr key={o.id} onClick={() => setReserve({ obs: o })} style={{ cursor: 'pointer' }} className={o.soldee_le ? 'vb-levee' : undefined}>
                <td><b>{o.numero}</b></td><td>{libelleCategorie(o.categorie_reserve)}</td><td>{o.texte}{dossier.positions.some((p) => p.observation_id === o.id) && ' 📍'}{dossier.photos.some((p) => p.observation_id === o.id) && ' 📷'}</td>
                <td>{fr(o.echeance)}</td><td>{o.soldee_le ? `✓ ${fr(o.soldee_le)}` : ''}</td>
              </tr>))}
            </tbody>
          </table></div>}
      </section>}

      {/* Étapes et formulaires */}
      {ETAPES.filter((e) => e.genre === r.genre).map((e) => (
        <EtapeReception key={e.code} etape={e} d={d} changer={changer} reserves={reserves}
          codes={e.code === 'EXE6/7' ? formulaires.filter((c) => c === 'EXE6' || c === 'EXE7') : [e.code as CodeExe]} document={document} />
      ))}

      <FicheReserve dossier={dossier} reception={r} etat={reserve} fermer={() => setReserve(null)} recharger={recharger} urls={urls} />
    </div>
  )
}

const addDays = (iso: string, n: number) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

function EtapeReception({ etape, d, changer, reserves, codes, document }: {
  etape: Etape; d: Donnees; changer: (cle: string, v: string | boolean | undefined) => void; reserves: ReturnType<typeof reservesDe>
  codes: CodeExe[]; document: (code: CodeExe, outlook: boolean) => Promise<void>
}) {
  const dateCle = etape.champs.find((c) => c.type === 'date' && /_le$/.test(c.cle) && c.cle !== 'convocation_le')?.cle
  const fait = dateCle && d[dateCle]
  return (
    <details className="carte vb-etape">
      <summary>
        <span className={`vb-etape-etat${fait ? ' fait' : ''}`} aria-hidden="true">{fait ? '✓' : ''}</span>
        <strong>{codes.join(' / ')}</strong> — {etape.titre}
        {fait && <span className="vb-discret"> · {fr(String(d[dateCle!]))}</span>}
      </summary>
      <div className="pile" style={{ padding: '4px 14px 14px', gap: 10 }}>
        <div className="vb-champs-exe">
          {etape.champs.filter((c) => estVisible(c, d, reserves)).map((c) => <ChampExe key={c.cle} c={c} d={d} changer={changer} reserves={reserves} />)}
        </div>
        <div className="vb-barre" style={{ margin: 0 }}>
          {codes.map((code) => <span key={code} style={{ display: 'inline-flex', gap: 6 }}>
            <button type="button" className="bouton principal" onClick={() => document(code, false)}>{code} — Word</button>
            <button type="button" className="bouton" onClick={() => document(code, true)} title="Brouillon Outlook au titulaire, formulaire joint">✉ Outlook</button>
          </span>)}
          <span className="vb-discret">{codes.map((c) => TITRES[c]).join(' / ')}</span>
        </div>
      </div>
    </details>
  )
}

function ChampExe({ c, d, changer, reserves }: { c: Champ; d: Donnees; changer: (cle: string, v: string | boolean | undefined) => void; reserves: ReturnType<typeof reservesDe> }) {
  const saisi = d[c.cle] !== undefined && d[c.cle] !== ''
  const v = valeur(d, reserves, c.cle)
  const propose = !saisi && v !== undefined && v !== '' && v !== false
  const etiquette = <span>{c.libelle}{propose && <span className="vb-propose" title="Valeur proposée d’après les réserves et les étapes précédentes"> · proposé</span>}</span>
  if (c.type === 'case') return (
    <label className="vb-champ-case"><input type="checkbox" checked={!!v} onChange={(e) => changer(c.cle, e.target.checked)} />{etiquette}</label>)
  if (c.type === 'ouinon') return (
    <div className="champ-form">{etiquette}
      <div className="vb-puces">{(['oui', 'non'] as const).map((o) => <button key={o} type="button" className="vb-puce" aria-pressed={v === o} onClick={() => changer(c.cle, o)}>{o === 'oui' ? 'Oui' : 'Non'}</button>)}</div>
    </div>)
  if (c.type === 'choix') return (
    <label className="champ-form">{etiquette}
      <select className="champ" value={String(v ?? '')} onChange={(e) => changer(c.cle, e.target.value)}>
        {v === undefined && <option value="">—</option>}
        {c.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select></label>)
  if (c.type === 'long') return (
    <label className="champ-form vb-champ-large">{etiquette}<textarea className="champ" rows={2} value={String(v ?? '')} onChange={(e) => changer(c.cle, e.target.value)} /></label>)
  return (
    <label className="champ-form">{etiquette}
      <input className="champ" type={c.type === 'date' ? 'date' : 'text'} value={String(v ?? '')} onChange={(e) => changer(c.cle, e.target.value)} /></label>)
}

/** Saisie d'une réserve : nature (rubrique des formulaires), désignation, délai, levée, photos, pastille sur plan. */
function FicheReserve({ dossier, reception, etat, fermer, recharger, urls }: {
  dossier: Dossier; reception: Reception; etat: { obs: Observation | null; position?: { planId: string; x: number; y: number } } | null
  fermer: () => void; recharger: () => Promise<void>; urls: Map<string, string>
}) {
  const { statuts } = useVisibat()
  const o = etat?.obs ?? null
  const [f, setF] = useState({ texte: '', categorie: 'malfacon', echeance: '', levee: '' })
  const [enAttente, setEnAttente] = useState<{ id: string; fichier: File; url: string }[]>([])
  useEffect(() => {
    if (!etat) return
    setF({ texte: o?.texte ?? '', categorie: o?.categorie_reserve ?? 'malfacon', echeance: o?.echeance ?? String(reception.donnees.d_malfacons_avant ?? reception.donnees.p_malfacons_avant ?? ''), levee: o?.soldee_le ?? '' })
    setEnAttente([])
  }, [etat, o, reception.donnees])
  if (!etat) return null
  const photos = o ? dossier.photos.filter((p) => p.observation_id === o.id) : []
  const soldee = statuts.find((s) => s.soldant)?.code ?? 'soldee'
  const position = o ? dossier.positions.find((p) => p.observation_id === o.id) : undefined
  const envoyerPhoto = async (id: string, fichier: File, ordre: number) => {
    const chemin = `${dossier.operation.id}/photos/${id}/${crypto.randomUUID()}.jpg`
    await deposer(BUCKET, chemin, await preparerPhoto(fichier), 'image/jpeg')
    await enregistrer('observation_photo', { observation_id: id, storage_path: chemin, ordre })
  }
  const numero = () => {
    const n = dossier.reserves.filter((x) => x.reception_id === reception.id).map((x) => Number(x.numero.replace(/\D/g, '')) || 0)
    return `R${(n.length ? Math.max(...n) : 0) + 1}`
  }
  return (
    <Dialogue large titre={o ? `Réserve ${o.numero}` : 'Nouvelle réserve'} ouvert={!!etat} fermer={fermer} libelleValider="Valider"
      danger={o ? { libelle: 'Supprimer', action: async () => { if (confirm('Supprimer cette réserve ?') && await executer(() => supprimer('observation', o.id).then(() => true), 'Réserve supprimée')) { await recharger(); fermer() } } } : undefined}
      valider={async () => {
        if (!f.texte.trim()) return signaler('La désignation est vide.', 'erreur')
        const ok = await executer(async () => {
          const num = o?.numero ?? numero()
          const obs = await enregistrer<Observation>('observation', {
            ...(o ? { id: o.id } : { operation_id: dossier.operation.id, reception_id: reception.id, reunion_id: null, numero: num, rubrique: 'lot', ordre: dossier.reserves.length }),
            texte: f.texte.trim(), categorie_reserve: f.categorie, echeance: f.echeance || null, soldee_le: f.levee || null,
            statut_code: f.levee ? soldee : 'nouvelle', date_statut: f.levee || aujourdhui(),
          })
          if (!o && reception.lot_id) await enregistrer('observation_lot', { observation_id: obs.id, lot_id: reception.lot_id })
          if (!o && etat.position) await enregistrer('observation_position', { observation_id: obs.id, plan_id: etat.position.planId, x: etat.position.x, y: etat.position.y })
          for (const [i, p] of enAttente.entries()) await envoyerPhoto(obs.id, p.fichier, photos.length + i)
          return o ? 'Réserve enregistrée' : `Réserve ${num} créée`
        })
        if (ok) { signaler(ok); await recharger(); fermer() }
      }}>
      <div className="pile">
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="vb-discret" style={{ fontWeight: 600, paddingBottom: 6 }}>Nature (rubrique des formulaires)</legend>
          <div className="vb-puces">{CATEGORIES.map((c) => <button key={c.code} type="button" className="vb-puce" aria-pressed={f.categorie === c.code} onClick={() => setF({ ...f, categorie: c.code })} title={c.libelle}>{c.court}</button>)}</div>
        </fieldset>
        <label className="champ-form"><span>Désignation</span>
          <textarea className="champ vb-description" rows={4} value={f.texte} onChange={(e) => setF({ ...f, texte: e.target.value })} placeholder="Localisation et description de la réserve (la dictée du clavier fonctionne ici)" /></label>
        <div className="grille-2">
          <label className="champ-form">À lever avant le<input className="champ" type="date" value={f.echeance} onChange={(e) => setF({ ...f, echeance: e.target.value })} /></label>
          <label className="champ-form">Levée le<input className="champ" type="date" value={f.levee} onChange={(e) => setF({ ...f, levee: e.target.value })} />
            {!f.levee && <button type="button" className="bouton petit" style={{ alignSelf: 'flex-start' }} onClick={() => setF({ ...f, levee: aujourdhui() })}>Levée aujourd’hui</button>}</label>
        </div>
        <div className="vb-barre" style={{ margin: 0 }}>
          <span className="vb-discret" style={{ fontWeight: 600, flex: 1 }}>Photos</span>
          <BoutonFichier className="bouton petit" libelle="+ Photo" accept="image/*" multiple choisir={async (fichiers) => {
            if (!o) { setEnAttente((l) => [...l, ...fichiers.map((x) => ({ id: crypto.randomUUID(), fichier: x, url: URL.createObjectURL(x) }))]); return }
            if (await executer(async () => { for (const [i, x] of fichiers.entries()) await envoyerPhoto(o.id, x, photos.length + i); return true }, 'Photo ajoutée')) await recharger()
          }} />
        </div>
        <Photos photos={[...photos.map((p) => ({ id: p.id, url: urlPhoto(urls, p.storage_path) })), ...enAttente.map((p) => ({ id: p.id, url: p.url }))]}
          surSupprimer={async (id) => {
            if (enAttente.some((p) => p.id === id)) { setEnAttente((l) => l.filter((p) => p.id !== id)); return }
            if (await executer(() => supprimer('observation_photo', id).then(() => true), 'Photo retirée')) await recharger()
          }} />
        {(etat.position || position) && <p className="vb-discret" style={{ margin: 0 }}>📍 Pastille posée sur le plan « {dossier.plans.find((p) => p.id === (etat.position?.planId ?? position!.plan_id))?.libelle} »</p>}
      </div>
    </Dialogue>
  )
}
