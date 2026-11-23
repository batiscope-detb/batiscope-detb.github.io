import { lazy, Suspense, useEffect, useState } from 'react'
import type { Repere } from '../../composants/Plan'
import { BoutonFichier, Champ, Dialogue, executer } from '../../composants/Ui'
import { deposerFichier, nombrePages, preparerPlan } from '../../ecriture'
import { statutDe, useVisibat } from '../contexte'
import { BUCKET, enregistrer, modifier, plansDuBatiment, supprimer, type Dossier, type Observation, type Plan as PlanVb } from '../donnees'
import { urlPlan } from '../useUrls'

// Le lecteur de PDF est lourd : chargé seulement quand un plan s'affiche.
const Plan = lazy(() => import('../../composants/Plan').then((m) => ({ default: m.Plan })))

/** Onglet « Plans » d'une opération : import (PDF ou image), reprise des plans du bâtiment, renommage, retrait. */
export function GestionPlans({ dossier, recharger, urls }: { dossier: Dossier; recharger: () => Promise<void>; urls: Map<string, string> }) {
  const op = dossier.operation
  const [choixPage, setChoixPage] = useState<{ fichier: Blob; nom: string; pages: number; page: number } | null>(null)
  const [batiment, setBatiment] = useState<Awaited<ReturnType<typeof plansDuBatiment>>>([])
  const [apercu, setApercu] = useState<string | null>(null)
  useEffect(() => { if (op.projet_id) plansDuBatiment(op.projet_id).then(setBatiment).catch(() => setBatiment([])) }, [op.projet_id])

  async function choisir(f: File) {
    const r = await executer(async () => { const pdf = await preparerPlan(f); return { pdf, pages: await nombrePages(pdf) } })
    if (!r) return
    const nom = f.name.replace(/\.[^.]+$/, '')
    if (r.pages > 1) setChoixPage({ fichier: r.pdf, nom, pages: r.pages, page: 1 })
    else await envoyer(r.pdf, nom, 0)
  }
  async function envoyer(pdf: Blob, libelle: string, page: number) {
    const chemin = `${op.id}/plans/${crypto.randomUUID()}.pdf`
    const ok = await executer(async () => {
      await deposerFichier(BUCKET, chemin, pdf, 'application/pdf')
      return enregistrer('plan', { operation_id: op.id, libelle, storage_path: chemin, page_index: page, ordre: dossier.plans.length, bucket: BUCKET })
    }, 'Plan importé')
    if (ok) { setChoixPage(null); await recharger() }
  }
  async function reprendre(p: (typeof batiment)[number]) {
    const ok = await executer(() => enregistrer('plan', { operation_id: op.id, libelle: p.libelle, storage_path: p.storage_path, page_index: p.page_index, ordre: dossier.plans.length, bucket: 'plans-releves', niveau_id: p.niveau_id }), `Plan « ${p.libelle} » ajouté`)
    if (ok) await recharger()
  }
  const dejaRepris = new Set(dossier.plans.filter((p) => p.niveau_id).map((p) => p.niveau_id))
  const aReprendre = batiment.filter((p) => !dejaRepris.has(p.niveau_id))

  return <>
    <div className="vb-barre">
      <BoutonFichier className="bouton primaire" libelle="+ Importer un plan (PDF ou image)" accept="application/pdf,image/jpeg,image/png" choisir={([f]) => choisir(f)} />
      {aReprendre.length > 0 && <span className="vb-discret">Plans du bâtiment disponibles :</span>}
      {aReprendre.map((p) => <button key={p.niveau_id} type="button" className="bouton" onClick={() => reprendre(p)}>+ {p.libelle}</button>)}
    </div>
    {dossier.plans.length === 0 && <p className="vide">Aucun plan. Importez un PDF ou une image{op.projet_id ? ', ou reprenez les plans du bâtiment' : ''}. Vous pourrez ensuite poser des pastilles en réunion.</p>}
    <section className="carte tableau-conteneur">
      {dossier.plans.length > 0 && <table className="tableau">
        <thead><tr><th>Plan</th><th>Origine</th><th>Pastilles</th><th></th></tr></thead>
        <tbody>{dossier.plans.map((p) => (
          <tr key={p.id}>
            <td><input className="champ petit" style={{ width: '100%' }} defaultValue={p.libelle} aria-label="Nom du plan"
              onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== p.libelle && await executer(() => modifier('plan', p.id, { libelle: e.target.value.trim() }).then(() => true))) await recharger() }} /></td>
            <td>{p.bucket === 'plans-releves' ? 'Bâtiment (Batiscope)' : 'Importé'}{p.page_index ? ` · page ${p.page_index + 1}` : ''}</td>
            <td>{dossier.positions.filter((x) => x.plan_id === p.id).length}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button type="button" className="bouton petit" onClick={() => setApercu(p.id)}>Voir</button>{' '}
              <button type="button" className="bouton petit danger" onClick={async () => {
                if (confirm('Retirer ce plan de l’opération ? Les pastilles posées dessus disparaîtront.') && await executer(() => supprimer('plan', p.id).then(() => true), 'Plan retiré')) await recharger()
              }}>Retirer</button>
            </td>
          </tr>))}
        </tbody>
      </table>}
    </section>
    {apercu && (() => {
      const p = dossier.plans.find((x) => x.id === apercu)!
      const u = urlPlan(urls, p)
      return <section className="carte"><div className="vb-barre" style={{ marginBottom: 8 }}><strong style={{ flex: 1 }}>{p.libelle}</strong><button type="button" className="bouton petit" onClick={() => setApercu(null)}>Fermer</button></div>
        {u ? <Suspense fallback={<div className="chargement"><span className="roue" /></div>}><Plan url={u} page={p.page_index} reperes={[]} /></Suspense> : <div className="chargement"><span className="roue" />Chargement…</div>}
      </section>
    })()}
    <Dialogue titre="Page du plan" ouvert={!!choixPage} fermer={() => setChoixPage(null)} libelleValider="Importer"
      valider={async () => { if (choixPage) await envoyer(choixPage.fichier, choixPage.nom, choixPage.page - 1) }}>
      {choixPage && <Champ libelle={`Le PDF compte ${choixPage.pages} pages : laquelle est le plan ?`}>
        <input className="champ" type="number" min={1} max={choixPage.pages} value={choixPage.page} onChange={(e) => setChoixPage({ ...choixPage, page: Math.min(choixPage.pages, Math.max(1, Number(e.target.value) || 1)) })} />
      </Champ>}
    </Dialogue>
  </>
}

/** Plan d'une réunion avec les pastilles des observations visibles ; mode « poser » pour créer une observation positionnée. */
export function PlanReunion({ dossier, observations, urls, poser, ouvrir, recharger }: {
  dossier: Dossier; observations: Observation[]; urls: Map<string, string>
  poser: (planId: string, x: number, y: number) => void; ouvrir: (o: Observation) => void; recharger: () => Promise<void>
}) {
  const { statuts } = useVisibat()
  const [planId, setPlanId] = useState<string | null>(() => { try { return localStorage.getItem(`visibat-plan-${dossier.operation.id}`) } catch { return null } })
  const [mode, setMode] = useState<'consulter' | 'poser' | 'deplacer'>('consulter')
  const plan: PlanVb | undefined = dossier.plans.find((p) => p.id === planId) ?? dossier.plans[0]
  if (!dossier.plans.length) return <p className="vide">Aucun plan pour cette opération : importez-en un dans l’onglet « Plans » de l’opération.</p>
  const choisirPlan = (id: string) => { setPlanId(id); try { localStorage.setItem(`visibat-plan-${dossier.operation.id}`, id) } catch { /* rien */ } }
  const parId = new Map(observations.map((o) => [o.id, o]))
  const positions = dossier.positions.filter((p) => p.plan_id === plan.id && parId.has(p.observation_id))
  const reperes: Repere[] = positions.map((p) => {
    const o = parId.get(p.observation_id)!
    const s = statutDe(statuts, o.statut_code)
    return { id: p.id, x: p.x, y: p.y, texte: o.numero, titre: `${o.numero} — ${s?.libelle ?? ''} — ${o.texte.slice(0, 80)}`, couleur: s?.couleur }
  })
  const url = urlPlan(urls, plan)

  return <>
    <div className="vb-barre">
      <select className="champ" value={plan.id} onChange={(e) => choisirPlan(e.target.value)} aria-label="Plan affiché">
        {dossier.plans.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
      </select>
      <div className="vb-puces" role="group" aria-label="Mode">
        <button type="button" className="vb-puce" aria-pressed={mode === 'consulter'} onClick={() => setMode('consulter')}>Consulter</button>
        <button type="button" className="vb-puce" aria-pressed={mode === 'poser'} onClick={() => setMode('poser')}>● Poser une remarque</button>
        <button type="button" className="vb-puce" aria-pressed={mode === 'deplacer'} onClick={() => setMode('deplacer')}>Déplacer les pastilles</button>
      </div>
      <span className="vb-discret">{mode === 'poser' ? 'Touchez le plan : la saisie de la remarque s’ouvre, déjà positionnée.' : mode === 'deplacer' ? 'Faites glisser une pastille.' : 'Touchez une pastille pour ouvrir l’observation.'}</span>
    </div>
    <section className="carte" style={{ padding: 8 }}>
      {url ? <Suspense fallback={<div className="chargement"><span className="roue" />Chargement du plan…</div>}>
        <Plan url={url} page={plan.page_index} reperes={reperes} viseur={mode === 'poser'}
          surClic={mode === 'poser' ? (x, y) => poser(plan.id, x, y) : undefined}
          surChoix={(id) => { const p = positions.find((z) => z.id === id); const o = p && parId.get(p.observation_id); if (o) ouvrir(o) }}
          surDeplacement={mode === 'deplacer' ? async (id, x, y) => { if (await executer(() => modifier('observation_position', id, { x, y }).then(() => true))) await recharger() } : undefined} />
      </Suspense> : <div className="chargement"><span className="roue" />Chargement du plan…</div>}
    </section>
    {positions.length === 0 && <p className="vb-discret">Aucune pastille sur ce plan pour cette réunion.</p>}
  </>
}
