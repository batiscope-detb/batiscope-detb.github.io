/**
 * Diffusion du CR par Outlook : on prépare un brouillon (.eml marqué « non envoyé »),
 * qu'Outlook ouvre comme un nouveau message prêt à compléter et à envoyer depuis l'adresse de l'agent.
 * Les destinataires sont en copie cachée pour ne pas diffuser les adresses des entreprises entre elles.
 */
import type { Dossier, Reunion } from './donnees'

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const enTete = (s: string) => `=?UTF-8?B?${b64(s)}?=`
const date = (iso: string | null) => iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''

export function objetCR(dossier: Dossier, reunion: Reunion) {
  return `[${dossier.operation.nom}] Compte rendu de chantier n° ${reunion.numero} du ${new Date(reunion.date_reunion).toLocaleDateString('fr-FR')}`
}

export function corpsCR(dossier: Dossier, reunion: Reunion, signature: string) {
  return [
    'Bonjour,',
    '',
    `Veuillez trouver ci-joint le compte rendu de la réunion de chantier n° ${reunion.numero} (${dossier.operation.nom}).`,
    reunion.prochaine_date ? `Prochaine réunion : ${date(reunion.prochaine_date)}${reunion.prochaine_lieu ? ` – ${reunion.prochaine_lieu}` : ''}.` : '',
    '',
    dossier.operation.clause_diffusion ?? '',
    '',
    'Cordialement,',
    signature,
  ].filter((l, i, t) => !(l === '' && t[i - 1] === '')).join('\r\n')
}

export function construireEml(destinataires: string[], objet: string, corps: string): string {
  return [
    'X-Unsent: 1',
    'To: ',
    `Bcc: ${destinataires.join(', ')}`,
    `Subject: ${enTete(objet)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    (b64(corps).match(/.{1,76}/g) ?? []).join('\r\n'),
  ].join('\r\n')
}

export function emailOutlook(dossier: Dossier, reunion: Reunion, destinataires: string[], signature: string) {
  const eml = construireEml(destinataires, objetCR(dossier, reunion), corpsCR(dossier, reunion, signature))
  const url = URL.createObjectURL(new Blob([eml], { type: 'message/rfc822' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `CR ${reunion.numero} - ${dossier.operation.nom.replace(/[\\/:*?"<>|]/g, '')}.eml`
  document.body.appendChild(a); a.click(); a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}
