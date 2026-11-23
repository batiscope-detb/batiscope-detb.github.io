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

export interface PieceJointe { nom: string; contenu: Uint8Array; type: string }

/** Base64 d'un contenu binaire, par morceaux (pas de dépassement de pile sur un gros PDF). */
export function base64(o: Uint8Array): string {
  let s = ''
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000))
  return btoa(s)
}
const lignes76 = (t: string) => (t.match(/.{1,76}/g) ?? []).join('\r\n')

/** Message .eml marqué « non envoyé » (Outlook l'ouvre comme un brouillon), avec pièces jointes éventuelles. */
export function construireEml(destinataires: string[], objet: string, corps: string, pieces: PieceJointe[] = []): string {
  const tete = ['X-Unsent: 1', 'To: ', `Bcc: ${destinataires.join(', ')}`, `Subject: ${enTete(objet)}`, 'MIME-Version: 1.0']
  const texte = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', lignes76(b64(corps))]
  if (!pieces.length) return [...tete, ...texte].join('\r\n')
  const frontiere = `----=_Visibat_${Math.random().toString(36).slice(2)}`
  const parties = pieces.map((p) => [
    `--${frontiere}`, `Content-Type: ${p.type}; name="${enTete(p.nom)}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${enTete(p.nom)}"`, '', lignes76(base64(p.contenu)),
  ].join('\r\n'))
  return [...tete, `Content-Type: multipart/mixed; boundary="${frontiere}"`, '', `--${frontiere}`, ...texte, ...parties, `--${frontiere}--`, ''].join('\r\n')
}

export const nomFichier = (t: string) => t.replace(/[\\/:*?"<>|]/g, '').trim()

export function telecharger(nom: string, contenu: Blob) {
  const url = URL.createObjectURL(contenu)
  const a = document.createElement('a')
  a.href = url; a.download = nom
  document.body.appendChild(a); a.click(); a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function emailOutlook(dossier: Dossier, reunion: Reunion, destinataires: string[], signature: string, pieces: PieceJointe[] = []) {
  const eml = construireEml(destinataires, objetCR(dossier, reunion), corpsCR(dossier, reunion, signature), pieces)
  telecharger(`CR ${reunion.numero} - ${nomFichier(dossier.operation.nom)}.eml`, new Blob([eml], { type: 'message/rfc822' }))
}
