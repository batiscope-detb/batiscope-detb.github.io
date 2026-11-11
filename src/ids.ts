/**
 * Identifiants. Les identifiants « stables » sont calculés exactement comme
 * java.util.UUID.nameUUIDFromBytes (MD5, version 3) sur la tablette : le bureau et la tablette
 * obtiennent le même identifiant pour le même objet (ex. le diagnostic d'un bâtiment),
 * ce qui évite les doublons quand les deux le créent chacun de leur côté.
 */
export const nouvelId = (): string => crypto.randomUUID()

export function idStable(texte: string): string {
  const b = md5(new TextEncoder().encode(texte))
  b[6] = (b[6] & 0x0f) | 0x30
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const idDiagnostic = (projetId: string) => idStable(`detb:diagnostic:${projetId}`)

// MD5 (RFC 1321), suffisant ici : sert à dériver un identifiant, pas à sécuriser quoi que ce soit.
function md5(msg: Uint8Array): Uint8Array {
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)
  const len = msg.length
  const total = (((len + 8) >> 6) + 1) * 64
  const buf = new Uint8Array(total)
  buf.set(msg); buf[len] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(total - 8, (len * 8) >>> 0, true)
  dv.setUint32(total - 4, Math.floor(len / 0x20000000), true)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let o = 0; o < total; o += 64) {
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + K[i] + dv.getUint32(o + g * 4, true)) >>> 0
      A = D; D = C; C = B
      B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) >>> 0
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ;[a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true))
  return out
}
