import { useState } from 'react'
import { useDonnees } from '../../App'
import { date, octets, LIBELLE_STATUT_ERP } from '../../donnees'
import { BoutonFichier, executer, signaler } from '../../composants/Ui'
import { useFiche } from './contexte'

/** Clôture, archivage sur OneDrive, libération de l'espace serveur et réouverture d'un bâtiment. */
export default function CycleVie() {
  const { ind, edition } = useFiche()
  const { recharger, nomAgent, role } = useDonnees()
  const [etape, setEtape] = useState<string | null>(null)
  const p = ind.projet
  const admin = role === 'admin'
  const archive = p.statut === 'archive'

  async function preparer() {
    const r = await executer(async () => {
      const { preparerArchive } = await import('../../archive')
      return preparerArchive(p, nomAgent, setEtape)
    })
    setEtape(null)
    if (!r) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(r.fichier); a.download = r.nom; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    signaler(`Archive prête (${r.nbFichiers} fichiers) : déposez-la sur le dossier OneDrive partagé.`)
    recharger()
  }

  async function liberer(f: File) {
    const r = await executer(async () => {
      const { verifierArchive, libererEspace } = await import('../../archive')
      setEtape('Vérification de l’archive…')
      const v = await verifierArchive(p, f)
      if (!v.conforme) throw new Error('Ce fichier ne correspond pas à la dernière archive préparée (empreinte différente) : rien n’a été supprimé.')
      if (!window.confirm(`Archive vérifiée.\n\nSupprimer du serveur les photos et plans de « ${p.nom} » (${octets(ind.octets)}) ?\nLes données restent consultables ; les fichiers pourront être remis en place depuis l'archive.`)) return null
      return libererEspace(p, setEtape)
    })
    setEtape(null)
    if (r != null) { signaler(`${r} fichier(s) supprimé(s) du serveur. Le bâtiment est archivé.`); recharger() }
  }

  async function rouvrirDepuis(f: File) {
    const r = await executer(async () => {
      const { verifierArchive, rouvrir } = await import('../../archive')
      setEtape('Lecture de l’archive…')
      const v = await verifierArchive(p, f)
      if (!v.conforme && !window.confirm('L’empreinte de ce fichier ne correspond pas à l’archive enregistrée (fichier modifié ou archive plus ancienne). Rouvrir quand même avec ce fichier ?')) return null
      return rouvrir(p, v.zip, v.manifeste, setEtape)
    })
    setEtape(null)
    if (r != null) { signaler(`Bâtiment rouvert : ${r} fichier(s) remis en place.`); recharger() }
  }

  return (
    <section className="carte">
      <h2>Clôture et archivage</h2>
      <p style={{ margin: '0 0 8px' }}>
        Statut : <span className={`etiquette e-${ind.statut}`}>{LIBELLE_STATUT_ERP[ind.statut]}</span>{' '}
        — fichiers sur le serveur : <b>{octets(ind.octets)}</b>
        {p.archive_nom && <> — dernière archive : <b>{p.archive_nom}</b> du {date(p.archive_le)}</>}
      </p>
      {etape && <p className="bandeau-placement"><span className="roue" style={{ width: 16, height: 16 }} /> {etape}</p>}
      {!edition ? <p className="note-param">Activez « Modification » pour archiver ou rouvrir ce bâtiment.</p> : (
        <>
          <ol className="etapes-archive">
            <li className={archive ? 'faite' : ''}><b>Préparer l'archive</b> : un fichier .zip avec toutes les données, photos et plans (à faire une fois le dossier terminé, par exemple après l'attestation).
              <div><button className="bouton petit" disabled={!!etape || archive} onClick={preparer}>Préparer l'archive (.zip)</button></div></li>
            <li className={archive ? 'faite' : ''}><b>Déposer le fichier sur le dossier OneDrive partagé</b>, sans le renommer ni le modifier.</li>
            <li className={archive ? 'faite' : ''}><b>Libérer l'espace serveur</b> : redonnez le fichier depuis OneDrive ; après vérification de son empreinte, les photos et plans sont supprimés du serveur. Les données restent au tableau de bord.
              <div>{admin
                ? <BoutonFichier className="bouton petit" libelle="Vérifier l'archive et libérer l'espace" accept=".zip,application/zip" choisir={([f]) => { if (etape) return; if (!p.archive_sha256) { signaler('Préparez d’abord l’archive (étape 1), ou cliquez sur « Actualiser » si elle vient d’être préparée.', 'erreur'); return } liberer(f) }} />
                : <span className="note-param">Réservé aux administrateurs.</span>}
                {!p.archive_sha256 && <span className="note-param"> (préparez d'abord l'archive)</span>}</div></li>
          </ol>
          {archive && (
            <div className="aide-prep">
              <b>Bâtiment archivé.</b> Pour le rouvrir (nouveau diagnostic, contrôle), redonnez l'archive : photos et plans sont remis en place et le statut d'avant l'archivage est rétabli.
              <div style={{ marginTop: 6 }}><BoutonFichier className="bouton petit" libelle="Rouvrir depuis l'archive" accept=".zip,application/zip" choisir={([f]) => !etape && rouvrirDepuis(f)} /></div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
