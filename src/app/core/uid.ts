/**
 * Gera um identificador único.
 *
 * `crypto.randomUUID()` só existe em contextos seguros (HTTPS ou localhost).
 * Ao acessar a aplicação por HTTP num IP de rede (ex.: http://192.168.x.x),
 * `crypto.randomUUID` fica indefinido e lança "crypto.randomUUID is not a function".
 * Esta função usa o UUID nativo quando disponível e cai num gerador
 * compatível (baseado em crypto.getRandomValues, com fallback final em Math.random).
 */
export function uid(): string {
  const c: Crypto | undefined = globalThis.crypto;

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    // Define a versão (4) e a variante conforme a RFC 4122.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') + '-' +
      hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' +
      hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }

  // Fallback final (não criptográfico) para ambientes muito antigos.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
}
