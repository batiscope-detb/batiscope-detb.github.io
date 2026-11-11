import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BUCKETS, LIBELLE_GRAVITE, date, euros, fusionner, type Constat, type Local } from '../../donnees'
import { deposerFichier, ecrire, preparerPhoto, supprimer } from '../../ecriture'
import { nouvelId } from '../../ids'
import { BoutonFichier, Champ, Dialogue, ecrireNombre, executer, lireNombre, signaler } from '../../composants/Ui'
import { Photos } from '../../composants/Photos'
import { couleurEtat, useFiche } from './contexte'

const GRAVITES = ['info', 'a_prevoir', 'urgent'] as const

export default function Releves() {
  const f = useFiche()
  const { ind, niveaux, locaux, constats, detail, urls, agents, edition, p } = f
  const [dlg, setDlg] = useState<{ constat: Constat | null; local: Local } | null>(null)
  const [filtre, setFiltre] = useState<'tous' | 'urgent' | 'non_chiffre'>('tous')
  if (!locaux.length) return <p className="vide">Aucun local pour l'instant.{edition && <> Créez-les dans l'onglet <Link to="?onglet=batiment">Niveaux et locaux</Link>.</>}</p>

  const lots = new Map(p.lots.map((l) => [l.id, l.libelle]))
  const points = new Map(p.points.map((x) => [x.id, x.libelle]))
  const pointsPar = new Map<string, string[]>()
  for (const cp of detail?.constatPoints ?? []) pointsPar.set(cp.constat_id, [...(pointsPar.get(cp.constat_id) ?? []), points.get(cp.point_controle_id) ?? '?'])
  const photosPar = new Map<string, { id: string; chemin: string }[]>()
  for (const ph of (detail?.photosReleves ?? []).slice().sort((a, b) => a.ordre - b.ordre)) if (ph.storage_path) photosPar.set(ph.constat_id, [...(photosPar.get(ph.constat_id) ?? []), { id: ph.id, chemin: ph.storage_path }])
  const garder = (c: Constat) => filtre === 'tous' || (filtre === 'urgent' ? c.gravite === 'urgent' : c.gravite !== 'info' && c.estimation == null)
  const ids = new Set(niveaux.map((n) => n.id))
  const groupes = [...niveaux.map((n) => ({ id: n.id, libelle: n.libelle })), { id: '', libelle: 'Sans niveau' }]
    .map((g) => ({ ...g, locaux: locaux.filter((l) => (g.id ? l.niveau_id === g.id : !l.niveau_id || !ids.has(l.niveau_id))) }))
    .filter((g) => g.locaux.length)

  async function ajouterPhotos(c: Constat, fichiers: File[]) {
    const deja = photosPar.get(c.id)?.length ?? 0
    for (const [k, fichier] of fichiers.entries()) {
      const id = nouvelId()
      const chemin = `${ind.projet.id}/constats/${id}.jpg`
      const r = await executer(async () => {
        const jpeg = await preparerPhoto(fichier)
        await deposerFichier(BUCKETS.photos, chemin, jpeg, 'image/jpeg')
        return ecrire('releves', 'photo', { constat_id: c.id, storage_path: chemin, ordre: deja + k, prise_le: new Date(fichier.lastModified).toISOString(), taille_octets: jpeg.size }, { cle: { id } })
      })
      if (!r) return
      await f.ajouterUrls(BUCKETS.photos, [chemin])
      f.majDetail((d) => ({ ...d, photosReleves: fusionner(d.photosReleves, r, (x) => x.id) }))
    }
    signaler(fichiers.length > 1 ? `${fichiers.length} photos ajoutées` : 'Photo ajoutée')
  }

  async function supprimerPhoto(id: string) {
    const ph = detail?.photosReleves.find((x) => x.id === id)
    if (!ph || !window.confirm('Supprimer cette photo ?')) return
    const r = await executer(() => supprimer('releves', 'photo', { id }, ph.maj_le ?? null), 'Photo supprimée')
    if (r) f.majDetail((d) => ({ ...d, photosReleves: d.photosReleves.filter((x) => x.id !== id) }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="filtres">
        <label>Afficher
          <select className="champ" value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)}>
            <option value="tous">Tous les constats</option><option value="urgent">Urgents</option><option value="non_chiffre">Non chiffrés</option>
          </select>
        </label>
        {edition && <span style={{ fontSize: 12, color: 'var(--encre-2)', alignSelf: 'center' }}>L'estimation (€ HT) se saisit ici, au bureau ; elle n'est pas modifiable sur la tablette.</span>}
      </div>
      {groupes.map((g) => (
        <section key={g.id || 'aucun'}>
          <h2>{g.libelle}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.locaux.map((l) => {
              const cs = constats.filter((c) => c.local_id === l.id).sort((a, b) => a.cree_le.localeCompare(b.cree_le))
              const visibles = cs.filter(garder)
              if (filtre !== 'tous' && !visibles.length) return null
              return (
                <details className="bloc" key={l.id} open={filtre !== 'tous' || cs.some((c) => c.gravite === 'urgent')}>
                  <summary>
                    <span>{l.libelle}</span>
                    {l.type && <span className="etiquette e-gris">{l.type}</span>}
                    {l.etat_general != null && <span className="etiquette" style={{ background: couleurEtat(l.etat_general), color: '#fff' }}>État {l.etat_general}/10</span>}
                    <span style={{ marginLeft: 'auto', color: 'var(--encre-2)', fontWeight: 400 }}>{cs.length} constat{cs.length > 1 ? 's' : ''}</span>
                  </summary>
                  <div>
                    {visibles.length === 0 && <p className="vide" style={{ padding: 6 }}>Aucun constat.</p>}
                    {visibles.map((c) => (
                      <div key={c.id} className="constat">
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <b>{c.lot_id ? lots.get(c.lot_id) ?? 'Lot supprimé' : 'Sans lot'}</b>
                          {c.gravite && <span className={`etiquette ${c.gravite === 'urgent' ? 'e-rouge' : c.gravite === 'a_prevoir' ? 'e-ambre' : 'e-gris'}`}>{LIBELLE_GRAVITE[c.gravite]}</span>}
                          {c.estimation != null ? <span className="num">{euros(Number(c.estimation))} HT</span> : c.gravite !== 'info' && <span className="etiquette e-gris">Non chiffré</span>}
                          <span style={{ marginLeft: 'auto', color: 'var(--encre-2)', fontSize: 12 }}>{date(c.maj_le)}{c.maj_par && agents.get(c.maj_par) ? ` — ${agents.get(c.maj_par)}` : ''}</span>
                          {edition && <>
                            <BoutonFichier className="bouton petit" libelle="+ Photo" accept="image/*" multiple choisir={(fs) => ajouterPhotos(c, fs)} />
                            <button className="bouton petit" onClick={() => setDlg({ constat: c, local: l })}>Modifier</button>
                          </>}
                        </div>
                        {pointsPar.get(c.id) && <div style={{ fontSize: 13, marginTop: 4 }}>Points relevés : {pointsPar.get(c.id)!.join(' · ')}</div>}
                        {c.note && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{c.note}</p>}
                        <Photos photos={(photosPar.get(c.id) ?? []).map((x) => ({ id: x.id, url: urls.get(x.chemin) }))} surSupprimer={edition ? supprimerPhoto : undefined} />
                      </div>
                    ))}
                    {edition && <button className="bouton petit" style={{ marginTop: 8 }} onClick={() => setDlg({ constat: null, local: l })}>+ Ajouter un constat</button>}
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      ))}
      <DialogueConstat cible={dlg} fermer={() => setDlg(null)} />
    </div>
  )
}

function DialogueConstat({ cible, fermer }: { cible: { constat: Constat | null; local: Local } | null; fermer: () => void }) {
  const f = useFiche()
  const { p, detail, locaux } = f
  const c = cible?.constat ?? null
  const cochesInitiales = new Set((detail?.constatPoints ?? []).filter((x) => x.constat_id === c?.id).map((x) => x.point_controle_id))
  const [v, setV] = useState<{ local_id?: string; lot_id?: string | null; gravite?: string; estimation?: string; note?: string; coches?: Set<string> }>({})
  const localId = v.local_id ?? cible?.local.id ?? ''
  const lotId = v.lot_id !== undefined ? v.lot_id : c?.lot_id ?? null
  const gravite = v.gravite ?? c?.gravite ?? 'a_prevoir'
  const estimation = v.estimation ?? ecrireNombre(c?.estimation)
  const note = v.note ?? c?.note ?? ''
  const coches = v.coches ?? cochesInitiales
  const fin = () => { setV({}); fermer() }
  const pointsLot = p.points.filter((x) => x.lot_id === lotId && (!x.obsolete || coches.has(x.id)))
  const lotsProposes = p.lots.filter((l) => !l.archive_le || l.id === lotId)

  async function valider() {
    const est = lireNombre(estimation)
    if (estimation.trim() && est == null) return signaler("L'estimation doit être un nombre (ex. 2 400 ou 2400,50).", 'erreur')
    const id = c?.id ?? nouvelId()
    const ligne = { local_id: localId, lot_id: lotId, gravite, estimation: est, note: note.trim() || null }
    const r = await executer(() => ecrire('releves', 'constat', ligne, c ? { cle: { id }, majLeConnue: c.maj_le } : { cle: { id } }), c ? 'Constat enregistré' : 'Constat ajouté')
    if (!r) return
    f.modifier((pp) => ({ ...pp, constats: fusionner(pp.constats, r, (x) => x.id) }))
    // Points de contrôle : seuls ceux du lot retenu restent cochés.
    const voulus = new Set([...coches].filter((x) => p.points.find((pt) => pt.id === x)?.lot_id === lotId))
    for (const pt of voulus) if (!cochesInitiales.has(pt)) {
      const rr = await executer(() => ecrire('releves', 'constat_point_controle', { supprime_le: null }, { cle: { constat_id: id, point_controle_id: pt } }))
      if (rr) f.majDetail((d) => ({ ...d, constatPoints: fusionner(d.constatPoints, rr, (x) => `${x.constat_id}|${x.point_controle_id}`) }))
    }
    for (const pt of cochesInitiales) if (!voulus.has(pt)) {
      const rr = await executer(() => supprimer('releves', 'constat_point_controle', { constat_id: id, point_controle_id: pt }))
      if (rr) f.majDetail((d) => ({ ...d, constatPoints: d.constatPoints.filter((x) => !(x.constat_id === id && x.point_controle_id === pt)) }))
    }
    fin()
  }

  async function supprimerConstat() {
    if (!c || !window.confirm('Supprimer ce constat (et ses photos) ?')) return
    const r = await executer(() => supprimer('releves', 'constat', { id: c.id }, c.maj_le), 'Constat supprimé')
    if (!r) return
    for (const ph of detail?.photosReleves.filter((x) => x.constat_id === c.id) ?? []) await executer(() => supprimer('releves', 'photo', { id: ph.id }))
    f.modifier((pp) => ({ ...pp, constats: pp.constats.filter((x) => x.id !== c.id) }))
    f.majDetail((d) => ({ ...d, photosReleves: d.photosReleves.filter((x) => x.constat_id !== c.id) }))
    fin()
  }

  return (
    <Dialogue titre={c ? 'Modifier le constat' : `Nouveau constat — ${cible?.local.libelle ?? ''}`} ouvert={!!cible} fermer={fin} valider={valider} large
      danger={c ? { libelle: 'Supprimer', action: supprimerConstat } : undefined}>
      <div className="grille-2">
        <Champ libelle="Local">
          <select className="champ" value={localId} onChange={(e) => setV((x) => ({ ...x, local_id: e.target.value }))}>
            {locaux.map((l) => <option key={l.id} value={l.id}>{l.libelle}</option>)}
          </select>
        </Champ>
        <Champ libelle="Corps d'état">
          <select className="champ" value={lotId ?? ''} onChange={(e) => setV((x) => ({ ...x, lot_id: e.target.value || null }))}>
            <option value="">Sans lot</option>{lotsProposes.map((l) => <option key={l.id} value={l.id}>{l.libelle}</option>)}
          </select>
        </Champ>
      </div>
      <div className="grille-2">
        <Champ libelle="Gravité">
          <div className="segments" role="radiogroup">
            {GRAVITES.map((g) => (
              <label key={g} className={gravite === g ? 'actif' : ''}>
                <input type="radio" name="gravite" value={g} checked={gravite === g} onChange={() => setV((x) => ({ ...x, gravite: g }))} />{LIBELLE_GRAVITE[g]}
              </label>
            ))}
          </div>
        </Champ>
        <Champ libelle="Estimation (€ HT)">
          <input className="champ" inputMode="decimal" value={estimation} onChange={(e) => setV((x) => ({ ...x, estimation: e.target.value }))} placeholder="ex. 2 400" />
        </Champ>
      </div>
      <Champ libelle="Observation"><textarea className="champ" rows={4} value={note} onChange={(e) => setV((x) => ({ ...x, note: e.target.value }))} /></Champ>
      {pointsLot.length > 0 && (
        <fieldset className="points">
          <legend>Points de contrôle relevés</legend>
          {pointsLot.map((pt) => (
            <label key={pt.id} className="case">
              <input type="checkbox" checked={coches.has(pt.id)} onChange={(e) => {
                const n = new Set(coches); if (e.target.checked) n.add(pt.id); else n.delete(pt.id); setV((x) => ({ ...x, coches: n }))
              }} /> {pt.libelle}
            </label>
          ))}
        </fieldset>
      )}
      {!c && <p style={{ fontSize: 12, color: 'var(--encre-2)' }}>Les photos s'ajoutent une fois le constat créé (bouton « + Photo »).</p>}
    </Dialogue>
  )
}
