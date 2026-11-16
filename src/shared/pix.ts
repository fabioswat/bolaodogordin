// Pix "copia e cola" estático (BR Code, padrão EMV do Banco Central), com valor fixo.
// Funciona com qualquer chave Pix (e-mail, telefone, CPF/CNPJ ou aleatória), inclusive do Mercado Pago.
// Não há integração com o banco: a confirmação do pagamento continua sendo feita pelo admin.

export interface PixInput {
  key: string;
  name: string;
  city: string;
  /** Valor em centavos; omita para o pagador digitar o valor. */
  amountCents?: number;
  /** Identificador da cobrança (até 25 letras/números); "***" quando não houver. */
  txid?: string;
}

function field(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}

/** Remove acentos e caracteres fora do padrão do BR Code. */
function clean(text: string, max: number): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9 .,\-@_/]/g, '').trim().slice(0, max);
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido pelo BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Normaliza a chave como os bancos esperam:
 * - e-mail e chave aleatória: minúsculas;
 * - telefone: deve começar com "+" (ex.: +5511999998888) — só os números são mantidos;
 * - CPF/CNPJ: só os números (aceita com pontos, traço e barra).
 * Retorna null se o formato não for reconhecido.
 */
export function normalizePixKey(raw: string): string | null {
  const key = raw.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return key.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return key.toLowerCase();
  if (/^\+[\d\s()-]+$/.test(key)) {
    const digits = key.replace(/\D/g, '');
    return digits.length >= 12 && digits.length <= 13 ? '+' + digits : null;
  }
  // CPF: só números ou 000.000.000-00, com dígitos verificadores válidos (evita confundir com telefone sem +55).
  if (/^\d{11}$/.test(key) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(key)) {
    const digits = key.replace(/\D/g, '');
    return validCpf(digits) ? digits : null;
  }
  // CNPJ: só números ou 00.000.000/0000-00.
  if (/^\d{14}$/.test(key) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(key)) return key.replace(/\D/g, '');
  return null;
}

function validCpf(d: string): boolean {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return (r === 10 ? 0 : r) === Number(d[len]);
  };
  return check(9) && check(10);
}

/** Lê os campos TLV (id de 2 dígitos, tamanho de 2 dígitos, valor) de um BR Code. */
function readTlv(text: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < text.length) {
    const id = text.slice(i, i + 2);
    const len = Number(text.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len) || i + 4 + len > text.length) return null;
    out.set(id, text.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

export type ParsedPix =
  | { ok: true; key: string; name: string; city: string }
  | { ok: false; reason: string };

/**
 * Extrai chave, nome e cidade de um "Pix copia e cola" (ex.: gerado no app do Mercado Pago),
 * para o admin não precisar digitar a chave. Códigos dinâmicos (cobrança com link) não têm a chave.
 */
export function parsePixPayload(raw: string): ParsedPix {
  const text = raw.trim();
  if (!text.startsWith('000201')) return { ok: false, reason: 'Não parece um Pix copia e cola.' };
  if (crc16(text.slice(0, -4)) !== text.slice(-4).toUpperCase()) {
    return { ok: false, reason: 'O código Pix colado está incompleto ou foi alterado. Copie de novo.' };
  }
  const top = readTlv(text);
  const account = top?.get('26');
  const sub = account ? readTlv(account) : null;
  if (!top || !sub || sub.get('00')?.toLowerCase() !== 'br.gov.bcb.pix') {
    return { ok: false, reason: 'Código Pix não reconhecido.' };
  }
  const key = sub.get('01');
  if (!key) {
    return { ok: false, reason: 'Esse código é de uma cobrança (com link) e não traz a chave. Use a sua chave Pix (e-mail, CPF, telefone ou aleatória).' };
  }
  return { ok: true, key, name: top.get('59') ?? '', city: top.get('60') ?? '' };
}

export function buildPixPayload(p: PixInput): string {
  const account = field('00', 'br.gov.bcb.pix') + field('01', p.key.trim());
  const txid = (p.txid ?? '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';
  let payload = field('00', '01')
    + field('26', account)
    + field('52', '0000')
    + field('53', '986')
    + (p.amountCents && p.amountCents > 0 ? field('54', (p.amountCents / 100).toFixed(2)) : '')
    + field('58', 'BR')
    + field('59', clean(p.name, 25) || 'RECEBEDOR')
    + field('60', clean(p.city, 15) || 'BRASIL')
    + field('62', field('05', txid));
  payload += '6304';
  return payload + crc16(payload);
}
