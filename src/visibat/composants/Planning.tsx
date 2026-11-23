import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react'
import { BoutonFichier, executer, signaler } from '../../composants/Ui'
import { modifier, type Dossier } from '../donnees'
import {
  COULEURS, analyserPredecesseurs, calculer, calendrier, depuisISO, descendre, desindenter, formaterPredecesseurs, herite, indenter, indexer, monter, niveau,
  normaliser, nouveauPlanning, nouvelId, supprimerBloc, versISO, type Calcul, type Planning, type Tache,
} from '../planning/moteur'

type Vue = 'structure' | 'lot' | 'zone'
const JOUR = 86400000
const dateCourte = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit' })

/** Planning initial : les lots de l'opération (mêmes identifiants, pour relier les remarques programmées). */
function planningInitial(dossier: Dossier): Planning {
  const debut = dossier.operation.debut_travaux ?? versISO(new Date())
  return nouveauPlanning(dossier.operation.nom, debut, dossier.lots.map((l, i) => ({ id: l.id, code: l.code, nom: l.libelle, entreprise: '', couleur: l.couleur ?? COULEURS[i % COULEURS.length] })))
}

/** Après import d'un fichier Planibat : un lot de même code qu'un lot de l'opération prend son identifiant. */
function rapprocherLots(p: Planning, dossier: Dossier): Planning {
  const corresp = new Map<string, string>()
  for (const l of p.lots) { const v = dossier.lots.find((x) => x.code.trim() === l.code.trim()); if (v) corresp.set(l.id, v.id) }
  return { ...p, lots: p.lots.map((l) => ({ ...l, id: corresp.get(l.id) ?? l.id })), taches: p.taches.map((t) => ({ ...t, lotId: t.lotId ? corresp.get(t.lotId) ?? t.lotId : null })) }
}

/** Onglet « Planning » d'une opération : planning optionnel, avec le moteur de Planibat. */
export function PlanningOperation({ dossier, recharger }: { dossier: Dossier; recharger: () => Promise<void> }) {
  const op = dossier.operation
  const [planning, setPlanning] = useState<Planning | null>(() => op.planning ? normaliser(op.planning, planningInitial(dossier)) : null)
  const [sel, setSel] = useState<string | null>(null)
  const [vue, setVue] = useState<Vue>('structure')
  const minuterie = useRef<number | undefined>(undefined)
  const calcul = useMemo(() => planning ? calculer(planning) : null, [planning])

  async function activer(p: Planning) {
    if (await executer(() => modifier('operation', op.id, { planning: p, planning_actif: true }).then(() => true), 'Planning activé')) { setPlanning(p); await recharger() }
  }
  async function importer(f: File) {
    const p = await executer(async () => rapprocherLots(normaliser(JSON.parse(await f.text()), planningInitial(dossier)), dossier))
    if (p) await activer(p)
  }
  /** Chaque modification est enregistrée après une courte pause (pas à chaque frappe). */
  function changer(f: (p: Planning) => Planning) {
    setPlanning((avant) => {
      if (!avant) return avant
      const p = f(structuredClone(avant))
      window.clearTimeout(minuterie.current)
      minuterie.current = window.setTimeout(() => { executer(() => modifier('operation', op.id, { planning: p })) }, 800)
      return p
    })
  }
  useEffect(() => () => window.clearTimeout(minuterie.current), [])

  if (!op.planning_actif || !planning || !calcul) return (
    <section className="carte pile" style={{ maxWidth: 820 }}>
      <h2 style={{ margin: 0 }}>Planning de chantier (facultatif)</h2>
      <p className="vb-discret" style={{ margin: 0 }}>Même moteur que Planibat : jours ouvrés, jours fériés, prédécesseurs, tâches récapitulatives, chemin critique.
        Une fois le planning en place, un extrait peut être joint au compte rendu.</p>
      <div className="vb-barre">
        <button type="button" className="bouton primaire" onClick={() => activer(planning ?? planningInitial(dossier))}>{planning ? 'Réactiver le planning' : 'Créer un planning'}</button>
        <BoutonFichier libelle="Importer un fichier Planibat (.json)" accept=".json,application/json" choisir={([f]) => importer(f)} />
      </div>
    </section>
  )

  const taches = planning.taches
  const parId = indexer(taches)
  const numParId = new Map(taches.map((t, i) => [t.id, i + 1]))
  const tache = sel ? taches.find((t) => t.id === sel) : undefined
  const ajouter = (sous: boolean) => changer((p) => {
    const i = sel ? p.taches.findIndex((t) => t.id === sel) : p.taches.length - 1
    const ref = i >= 0 ? p.taches[i] : undefined
    const t: Tache = { id: nouvelId('t'), parentId: sous ? ref?.id ?? null : ref?.parentId ?? null, lotId: null, zoneId: null, nom: 'Nouvelle tâche', duree: 5, preds: [], debutImpose: null, notes: '' }
    let pos = p.taches.length
    if (ref) { pos = i + 1; if (!sous) { const ids = new Set([ref.id]); while (pos < p.taches.length && p.taches[pos].parentId && ids.has(p.taches[pos].parentId!)) ids.add(p.taches[pos++].id) } }
    p.taches.splice(pos, 0, t)
    setSel(t.id)
    return p
  })
  const agir = (f: (t: Tache[], id: string) => unknown) => sel && changer((p) => { f(p.taches, sel); return p })
  const modifierTache = (id: string, champs: Partial<Tache>) => changer((p) => { const t = p.taches.find((x) => x.id === id); if (t) Object.assign(t, champs); return p })
  const ecrirePreds = (t: Tache, texte: string) => {
    const { liens, erreurs } = analyserPredecesseurs(texte)
    if (erreurs.length) signaler(`Prédécesseur non compris : ${erreurs.join(', ')} (exemples : 3, 3+5, 3DD+2, 3FF)`, 'erreur')
    const idParNum = new Map(taches.map((x, i) => [i + 1, x.id]))
    modifierTache(t.id, { preds: liens.filter((l) => idParNum.has(l.num) && idParNum.get(l.num) !== t.id).map((l) => ({ id: idParNum.get(l.num)!, type: l.type, decalage: l.decalage })) })
  }
  function exporter() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(planning, null, 2)], { type: 'application/json' }))
    a.download = `Planning - ${op.nom.replace(/[\\/:*?"<>|]/g, '')}.json`
    a.click(); window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  // Lignes affichées selon la vue
  const lignes: { t?: Tache; groupe?: string; couleur?: string; niv: number }[] = vue === 'structure'
    ? taches.map((t) => ({ t, niv: niveau(t, parId) }))
    : (vue === 'lot' ? planning.lots : planning.zones).map((g) => ({ g, liste: taches.filter((t) => !calcul.taches.get(t.id)?.recap && herite(t, parId, vue === 'lot' ? 'lotId' : 'zoneId') === g.id) }))
      .filter((x) => x.liste.length).flatMap((x) => [{ groupe: `${x.g.code} ${x.g.nom}`, couleur: x.g.couleur, niv: 0 }, ...x.liste.map((t) => ({ t, niv: 1 }))])
  const programmees = dossier.observations.filter((o) => o.date_intervention && o.statut_code === 'prog')

  return <>
    <div className="vb-barre">
      <label className="vb-discret">Début du chantier <input className="champ petit" type="date" value={planning.projet.debut} onChange={(e) => e.target.value && changer((p) => { p.projet.debut = e.target.value; return p })} /></label>
      <label className="case"><input type="checkbox" checked={planning.projet.feries} onChange={(e) => changer((p) => { p.projet.feries = e.target.checked; return p })} />Jours fériés chômés</label>
      <div className="vb-puces" role="group" aria-label="Vue">
        {([['structure', 'Structure'], ['lot', 'Par lot'], ['zone', 'Par zone']] as [Vue, string][]).map(([k, l]) => <button key={k} type="button" className="vb-puce" aria-pressed={vue === k} onClick={() => setVue(k)}>{l}</button>)}
      </div>
      <span className="vb-discret" style={{ marginLeft: 'auto' }}>
        {calcul.debutProjet && calcul.finProjet ? `Du ${dateCourte(calcul.debutProjet)} au ${dateCourte(calcul.finProjet)} · ${calcul.dureeOuvree} jours ouvrés` : 'Aucune tâche'}
      </span>
    </div>
    {vue === 'structure' && <div className="vb-barre">
      <button type="button" className="bouton petit primaire" onClick={() => ajouter(false)}>+ Tâche</button>
      <button type="button" className="bouton petit" onClick={() => ajouter(true)} disabled={!sel}>+ Sous-tâche</button>
      <button type="button" className="bouton petit" onClick={() => agir(monter)} disabled={!sel} aria-label="Monter">↑</button>
      <button type="button" className="bouton petit" onClick={() => agir(descendre)} disabled={!sel} aria-label="Descendre">↓</button>
      <button type="button" className="bouton petit" onClick={() => agir(desindenter)} disabled={!tache?.parentId} aria-label="Remonter d’un niveau">←</button>
      <button type="button" className="bouton petit" onClick={() => agir(indenter)} disabled={!sel} aria-label="Devenir sous-tâche de la tâche au-dessus">→</button>
      <button type="button" className="bouton petit danger" onClick={() => { if (sel && confirm('Supprimer cette tâche et ses sous-tâches ?')) { agir(supprimerBloc); setSel(null) } }} disabled={!sel}>Supprimer</button>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button type="button" className="bouton petit" onClick={exporter}>Exporter (.json Planibat)</button>
        <button type="button" className="bouton petit" onClick={async () => { if (confirm('Ne plus utiliser de planning pour cette opération ? (il reste conservé)') && await executer(() => modifier('operation', op.id, { planning_actif: false }).then(() => true))) await recharger() }}>Désactiver</button>
      </span>
    </div>}
    {calcul.boucles.length > 0 && <p className="vb-alerte">Boucle de prédécesseurs : tâches {calcul.boucles.map((id) => numParId.get(id)).join(', ')}. Corrigez la colonne « Préd. ».</p>}
    <section className="carte" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="vb-planning">
        <div className="tableau-conteneur">
          <table className="tableau vb-taches">
            <thead><tr><th>N°</th><th>Tâche</th><th>Lot</th><th>Zone</th><th>Durée</th><th>Préd.</th><th>Début</th><th>Fin</th></tr></thead>
            <tbody>{lignes.map((l, i) => l.groupe
              ? <tr key={`g${i}`} className="vb-groupe"><td colSpan={8}><span className="pastille-calque" style={{ background: l.couleur }} /> {l.groupe}</td></tr>
              : <LigneTache key={l.t!.id} t={l.t!} niv={l.niv} num={numParId.get(l.t!.id)!} calcul={calcul} planning={planning} choisie={sel === l.t!.id}
                choisir={() => setSel(l.t!.id)} modifier={(c) => modifierTache(l.t!.id, c)} preds={formaterPredecesseurs(l.t!.preds, numParId)} ecrirePreds={(x) => ecrirePreds(l.t!, x)} />)}
              {!taches.length && <tr><td colSpan={8} className="vide">Aucune tâche : « + Tâche » pour commencer.</td></tr>}
            </tbody>
          </table>
        </div>
        <Gantt planning={planning} calcul={calcul} lignes={lignes.map((l) => l.t ?? null)} selection={sel} choisir={setSel} modifier={modifierTache}
          jalons={programmees.map((o) => ({ date: o.date_intervention!, titre: `${o.numero} — ${o.texte.slice(0, 60)}` }))} />
      </div>
    </section>
    <p className="vb-discret">Prédécesseurs : <b>3</b> après la fin de la tâche 3 · <b>3+5</b> 5 jours ouvrés après · <b>3DD+2</b> 2 jours après son début · <b>3FF</b> finit en même temps. Durée 0 = jalon. Les remarques « Programmée » des CR figurent en losange violet sur la dernière ligne.</p>
  </>
}

function LigneTache({ t, niv, num, calcul, planning, choisie, choisir, modifier, preds, ecrirePreds }: {
  t: Tache; niv: number; num: number; calcul: Calcul; planning: Planning; choisie: boolean; choisir: () => void
  modifier: (c: Partial<Tache>) => void; preds: string; ecrirePreds: (texte: string) => void
}) {
  const r = calcul.taches.get(t.id)
  return (
    <tr className={`${choisie ? 'vb-choisie' : ''}${r?.critique ? ' vb-critique' : ''}`} onClick={choisir}>
      <td className="num">{num}</td>
      <td style={{ paddingLeft: 8 + niv * 16 }}><input className="champ petit" style={{ width: '100%', fontWeight: r?.recap ? 700 : 400 }} defaultValue={t.nom} key={t.nom} aria-label="Tâche"
        onBlur={(e) => e.target.value !== t.nom && modifier({ nom: e.target.value })} /></td>
      <td><select className="champ petit" value={t.lotId ?? ''} onChange={(e) => modifier({ lotId: e.target.value || null })} aria-label="Lot">
        <option value="">{t.parentId ? '↑ hérité' : '—'}</option>{planning.lots.map((l) => <option key={l.id} value={l.id}>{l.code} {l.nom}</option>)}</select></td>
      <td><select className="champ petit" value={t.zoneId ?? ''} onChange={(e) => modifier({ zoneId: e.target.value || null })} aria-label="Zone">
        <option value="">{t.parentId ? '↑' : '—'}</option>{planning.zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}</select></td>
      <td>{r?.recap ? <span className="vb-discret">{r.ef - r.es} j</span>
        : <input className="champ petit" style={{ width: 56 }} type="number" min={0} defaultValue={t.duree} key={t.duree} aria-label="Durée en jours ouvrés" onBlur={(e) => Number(e.target.value) !== t.duree && modifier({ duree: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />}</td>
      <td><input className="champ petit" style={{ width: 80 }} defaultValue={preds} key={preds} aria-label="Prédécesseurs" onBlur={(e) => e.target.value !== preds && ecrirePreds(e.target.value)} /></td>
      <td style={{ whiteSpace: 'nowrap' }}>{r ? dateCourte(r.debut) : ''}{t.debutImpose ? ' 📌' : ''}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{r ? dateCourte(r.fin) : ''}</td>
    </tr>)
}

/** Diagramme de Gantt (lecture seule) : une ligne par tâche, chemin critique en rouge, aujourd'hui en trait rouge. */
export function Gantt({ planning, calcul, lignes, selection, choisir, jalons = [], debut, fin, hauteurLigne = 41, modifier }: {
  planning: Planning; calcul: Calcul; lignes: (Tache | null)[]; selection?: string | null; choisir?: (id: string) => void
  jalons?: { date: string; titre: string }[]; debut?: Date; fin?: Date; hauteurLigne?: number
  /** Gantt modifiable à la souris : glisser une barre (début imposé), tirer son bord droit (durée). */
  modifier?: (id: string, champs: Partial<Tache>) => void
}) {
  const corps = useRef<HTMLDivElement>(null)
  const [glisse, setGlisse] = useState<{ id: string; mode: 'deplacer' | 'duree'; x0: number; dj: number } | null>(null)
  const parId = indexer(planning.taches)
  const d0 = debut ?? calcul.debutProjet ?? depuisISO(planning.projet.debut)
  const d1 = fin ?? new Date(Math.max((calcul.finProjet ?? d0).getTime() + 7 * JOUR, d0.getTime() + 30 * JOUR))
  const jours = Math.max(1, Math.round((d1.getTime() - d0.getTime()) / JOUR) + 1)
  const pct = (d: Date) => ((d.getTime() - d0.getTime()) / JOUR / jours) * 100
  const mois: { libelle: string; g: number; l: number }[] = []
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)); m <= d1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const suiv = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
    const g = Math.max(0, pct(m)), dr = Math.min(100, pct(suiv))
    mois.push({ libelle: m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), g, l: dr - g })
  }
  const auj = pct(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())))
  const joursParPx = () => jours / Math.max(1, corps.current?.getBoundingClientRect().width ?? 1)
  function bas(e: PE<HTMLSpanElement>, t: Tache, mode: 'deplacer' | 'duree') {
    if (!modifier || calcul.taches.get(t.id)?.recap) return
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId)
    setGlisse({ id: t.id, mode, x0: e.clientX, dj: 0 })
  }
  const bouge = (e: PE<HTMLSpanElement>) => glisse && setGlisse({ ...glisse, dj: Math.round((e.clientX - glisse.x0) * joursParPx()) })
  function haut(t: Tache) {
    const g = glisse, r = calcul.taches.get(t.id)
    setGlisse(null)
    if (!g || !r || !modifier || g.dj === 0) return
    const cal = calendrier(planning.projet.debut, { feries: planning.projet.feries, fermetures: planning.projet.fermetures })
    if (g.mode === 'deplacer') {
      const cible = new Date(r.debut.getTime() + g.dj * JOUR)
      // Ramenée à sa date au plus tôt (ou avant) : le début imposé est retiré, comme dans Planibat.
      const sansImpose = calculer({ ...planning, taches: planning.taches.map((x) => (x.id === t.id ? { ...x, debutImpose: null } : x)) }).taches.get(t.id)
      modifier(t.id, { debutImpose: sansImpose && cible <= sansImpose.debut ? null : versISO(cible) })
    } else {
      const finCible = new Date(r.fin.getTime() + (g.dj + 1) * JOUR)
      modifier(t.id, { duree: Math.max(1, cal.index(versISO(finCible)) - r.es) })
    }
  }
  const couleurLot = (t: Tache) => planning.lots.find((l) => l.id === herite(t, parId, 'lotId'))?.couleur ?? '#90a4ae'
  return (
    <div className="vb-gantt" style={{ ['--h' as string]: `${hauteurLigne}px` }}>
      <div className="vb-gantt-mois">{mois.map((m) => <span key={m.g} style={{ left: `${m.g}%`, width: `${m.l}%` }}>{m.libelle}</span>)}</div>
      <div className="vb-gantt-corps" ref={corps}>
        {auj >= 0 && auj <= 100 && <i className="vb-gantt-auj" style={{ left: `${auj}%` }} aria-hidden="true" />}
        {lignes.map((t, i) => {
          const r = t && calcul.taches.get(t.id)
          if (!t || !r) return <div key={`v${i}`} className="vb-gantt-ligne vb-groupe" />
          const dec = glisse?.id === t.id ? (glisse.dj / jours) * 100 : 0
          const g = pct(r.debut) + (glisse?.id === t.id && glisse.mode === 'deplacer' ? dec : 0)
          const l = Math.max(0.4, pct(new Date(r.fin.getTime() + JOUR)) - pct(r.debut) + (glisse?.id === t.id && glisse.mode === 'duree' ? dec : 0))
          const mobile = !!modifier && !r.recap
          return (
            <div key={t.id} className={`vb-gantt-ligne${selection === t.id ? ' vb-choisie' : ''}`} onClick={() => choisir?.(t.id)}>
              {t.duree === 0 && !r.recap
                ? <span className="vb-jalon" style={{ left: `${g}%` }} title={`${t.nom} — ${dateCourte(r.debut)}`} />
                : <span className={`vb-barre-g${r.recap ? ' recap' : ''}${r.critique ? ' critique' : ''}${mobile ? ' mobile' : ''}`} title={`${t.nom} — ${dateCourte(r.debut)} → ${dateCourte(r.fin)}${r.marge > 0 ? ` · marge ${r.marge} j` : ''}${mobile ? ' · glisser pour déplacer, tirer le bord droit pour la durée' : ''}`}
                  style={{ left: `${g}%`, width: `${l}%`, background: r.recap ? undefined : couleurLot(t) }}
                  onPointerDown={(e) => bas(e, t, 'deplacer')} onPointerMove={bouge} onPointerUp={() => haut(t)}>
                  {mobile && <span className="vb-poignee" onPointerDown={(e) => bas(e, t, 'duree')} onPointerMove={bouge} onPointerUp={(e) => { e.stopPropagation(); haut(t) }} />}
                </span>}
            </div>)
        })}
        {jalons.length > 0 && <div className="vb-gantt-ligne">{jalons.map((j, i) => <span key={i} className="vb-jalon prog" style={{ left: `${pct(depuisISO(j.date))}%` }} title={j.titre} />)}</div>}
      </div>
    </div>
  )
}

/** Extrait du planning pour le compte rendu : tâches en cours ou à venir sur la période. */
export function ExtraitPlanning({ planning, depuis, semaines }: { planning: Planning; depuis: Date; semaines: number | null }) {
  const calcul = calculer(planning)
  const fin = semaines ? new Date(depuis.getTime() + semaines * 7 * JOUR) : undefined
  const debut = semaines ? depuis : undefined
  const taches = planning.taches.filter((t) => {
    const r = calcul.taches.get(t.id)
    if (!r || r.recap) return false
    return !semaines || (r.fin >= depuis && r.debut <= fin!)
  })
  if (!taches.length) return <p>Aucune tâche du planning sur la période.</p>
  return (
    <div className="vb-extrait">
      <table><tbody>{taches.map((t) => { const r = calcul.taches.get(t.id)!; return (
        <tr key={t.id}><td>{t.nom}</td><td style={{ whiteSpace: 'nowrap' }}>{dateCourte(r.debut)} → {dateCourte(r.fin)}</td></tr>) })}</tbody></table>
      <Gantt planning={planning} calcul={calcul} lignes={taches} debut={debut} fin={fin} hauteurLigne={23} />
    </div>
  )
}
