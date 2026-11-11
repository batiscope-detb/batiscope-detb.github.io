import { euros, octets } from '../../donnees'
import { travauxParLot } from '../../calculs'
import { BarreConformite } from '../../composants/Barres'
import { useFiche } from './contexte'

export default function Synthese() {
  const { ind, constats, p } = useFiche()
    const lots = travauxParLot(constats, p.lots)
    return (
      <>
        <section className="grille-kpi">
          <div className="kpi"><span>Niveaux / locaux</span><b>{ind!.nbNiveaux} / {ind!.nbLocaux}</b></div>
          <div className="kpi"><span>Constats</span><b>{ind!.nbConstats}</b><small>{ind!.nbUrgents} urgent(s), {ind!.nbAPrevoir} à prévoir</small></div>
          <div className="kpi"><span>Travaux estimés</span><b>{euros(ind!.estimation)}</b><small>{ind!.constatsSansEstimation ? `${ind!.constatsSansEstimation} constat(s) non chiffré(s)` : 'HT'}</small></div>
          <div className="kpi"><span>Accessibilité</span><b>{ind!.taux == null ? '—' : `${ind!.taux} %`}</b><small>{ind!.acc.nonConformes} NC dont {ind!.acc.bloquantes} bloquante(s)</small></div>
          <div className="kpi"><span>Fichiers sur le serveur</span><b>{octets(ind!.octets)}</b><small>photos et plans</small></div>
        </section>
        <div className="deux-col">
          <section className="carte">
            <h2>Travaux par corps d'état</h2>
            {lots.length === 0 ? <p className="vide">Aucun constat à chiffrer.</p> : (
              <table className="tableau"><thead><tr><th>Corps d'état</th><th className="num">Constats</th><th className="num">Urgents</th><th className="num">Estimation HT</th></tr></thead>
                <tbody>{lots.map((l) => <tr key={l.lot}><td>{l.lot}</td><td className="num">{l.nb}</td><td className="num">{l.urgents || '—'}</td><td className="num">{l.montant ? euros(l.montant) : '—'}</td></tr>)}</tbody>
                <tfoot><tr><td><b>Total</b></td><td className="num"><b>{lots.reduce((s, l) => s + l.nb, 0)}</b></td><td /><td className="num"><b>{euros(ind!.estimation)}</b></td></tr></tfoot>
              </table>
            )}
          </section>
          <section className="carte">
            <h2>Accessibilité</h2>
            {!ind!.diagnostic ? <p className="vide">Pas encore de diagnostic accessibilité.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <BarreConformite s={ind!.acc} large />
                <table className="tableau"><tbody>
                  <tr><td>Conformes</td><td className="num">{ind!.acc.conformes}</td></tr>
                  <tr><td>Conformes sous tolérance</td><td className="num">{ind!.acc.sousTolerance}</td></tr>
                  <tr><td>Non conformes</td><td className="num">{ind!.acc.nonConformes}</td></tr>
                  <tr><td>dont bloquantes</td><td className="num">{ind!.acc.bloquantes}</td></tr>
                  <tr><td>À expertiser</td><td className="num">{ind!.acc.aExpertiser}</td></tr>
                  <tr><td>À renseigner</td><td className="num">{ind!.acc.aRenseigner}</td></tr>
                  <tr><td>Dérogations en cours / accordées</td><td className="num">{ind!.derogationsEnCours} / {ind!.derogationsAccordees}</td></tr>
                </tbody></table>
              </div>
            )}
          </section>
        </div>
      </>
    )
  }

