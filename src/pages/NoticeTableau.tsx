/** Saisie du tableau réglementaire de la notice (colonne « Dispositions prévues »), préremplie depuis le diagnostic. */
import { useEffect, useMemo, useState } from 'react'
import type { IndicateursErp } from '../calculs'
import { supabase, type Derogation } from '../donnees'
import { ecrire } from '../ecriture'
import { articleSansObjet, calculerTableau } from '../noticeTableau'
import { executer } from '../composants/Ui'

interface Retouche { ligne_id: string; texte: string | null; maj_le?: string }

export async function chargerRetouches(diagnosticId: string): Promise<Map<string, string | null>> {
  const { data } = await supabase.schema('accessibilite').from('notice_ligne').select('ligne_id,texte').eq('diagnostic_id', diagnosticId).is('supprime_le', null)
  return new Map(((data ?? []) as Retouche[]).map((x) => [x.ligne_id, x.texte]))
}

export default function NoticeTableau({ ind, derogations, edition }: { ind: IndicateursErp; derogations: Derogation[]; edition: boolean }) {
  const diag = ind.diagnostic!
  const [retouches, setRetouches] = useState<Map<string, string | null> | null>(null)
  const [brouillons, setBrouillons] = useState<Record<string, string>>({})
  const [toutOuvrir, setToutOuvrir] = useState(false)
  useEffect(() => { chargerRetouches(diag.id).then(setRetouches).catch(() => setRetouches(new Map())) }, [diag.id])
  const tableau = useMemo(() => (retouches ? calculerTableau(ind.elements, derogations, retouches) : []), [ind.elements, derogations, retouches])
  if (!retouches) return <div className="chargement"><span className="roue" />Chargement du tableau…</div>
  const aCompleter = tableau.flatMap((a) => a.lignes).filter((x) => x.calc && !x.calc.texte.trim()).length

  async function enregistrer(id: string, auto: string, texte: string) {
    const t = texte.trim()
    const valeur = t === auto.trim() ? null : t
    if ((retouches!.get(id) ?? null) === valeur) return
    const existe = retouches!.has(id)
    const r = await executer(() => ecrire('accessibilite', 'notice_ligne',
      existe ? { texte: valeur, supprime_le: valeur == null ? new Date().toISOString() : null } : { diagnostic_id: diag.id, ligne_id: id, texte: valeur, supprime_le: null },
      existe ? { cle: { diagnostic_id: diag.id, ligne_id: id }, majLeConnue: null } : { cle: { diagnostic_id: diag.id, ligne_id: id } }))
    if (r) {
      setRetouches((m) => { const n = new Map(m!); if (valeur == null) n.delete(id); else n.set(id, valeur); return n })
      setBrouillons((b) => { const n = { ...b }; delete n[id]; return n })
    }
  }

  return (
    <section className="carte">
      <div className="entete-carte">
        <h2>Tableau des dispositions réglementaires</h2>
        <label className="case"><input type="checkbox" checked={toutOuvrir} onChange={(e) => setToutOuvrir(e.target.checked)} /> Afficher aussi les articles sans objet</label>
      </div>
      <p className="note-param">
        Colonne de droite remplie automatiquement depuis le diagnostic (conforme, non conforme avec travaux ou dérogation, sans objet).
        Une ligne retouchée est conservée lors des mises à jour du diagnostic.{aCompleter ? ` ${aCompleter} ligne(s) restent à compléter.` : ''}
      </p>
      {tableau.map((a) => {
        const so = articleSansObjet(a.lignes)
        if (so && !toutOuvrir) return <p key={a.article} className="article-so">Article {a.article} — {a.titre} : sans objet</p>
        return (
          <details key={a.article} className="article-notice" open={!so}>
            <summary>Article {a.article} — {a.titre}</summary>
            <table className="tableau tableau-notice">
              <thead><tr><th>Dispositions réglementaires</th><th>Dispositions prévues et / ou descriptif des travaux envisagés</th></tr></thead>
              <tbody>
                {a.lignes.map((x, i) => x.s
                  ? <tr key={`s${i}`} className="sous-titre-notice"><td colSpan={2}>{x.s}</td></tr>
                  : (() => {
                    const c = x.calc!
                    const valeur = brouillons[c.id] ?? c.texte
                    return (
                      <tr key={c.id} className={!c.texte.trim() ? 'a-completer' : ''}>
                        <td>{x.l}</td>
                        <td>
                          <textarea className="champ" rows={Math.max(1, Math.min(6, valeur.split('\n').length + (valeur.length > 90 ? 1 : 0)))} disabled={!edition} value={valeur}
                            placeholder="À compléter" onChange={(e) => setBrouillons((b) => ({ ...b, [c.id]: e.target.value }))}
                            onBlur={() => { if (brouillons[c.id] != null) enregistrer(c.id, c.auto, brouillons[c.id]) }} />
                          {c.modifie && <span className="para-meta"><span className="etiquette e-ambre">Modifié</span>
                            {edition && <button className="lien-photo" onClick={() => enregistrer(c.id, c.auto, c.auto)}>Revenir au texte automatique</button>}</span>}
                        </td>
                      </tr>
                    )
                  })())}
              </tbody>
            </table>
          </details>
        )
      })}
    </section>
  )
}
