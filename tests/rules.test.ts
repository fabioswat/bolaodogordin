import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateNumbers, normalizeNumbers, countHits, prizeTier, paymentStatus, parseMoneyToCents, randomGame,
} from '../src/shared/rules.ts';
import { buildPixPayload, crc16, normalizePixKey } from '../src/shared/pix.ts';
import { openDatabase } from '../src/server/db.ts';

test('validateNumbers aceita 6 dezenas distintas de 1 a 60', () => {
  assert.equal(validateNumbers([1, 2, 3, 4, 5, 60]), null);
});

test('validateNumbers recusa quantidade, intervalo, repetição e tipo errados', () => {
  assert.match(validateNumbers([1, 2, 3, 4, 5])!, /exatamente 6/);
  assert.match(validateNumbers([1, 2, 3, 4, 5, 6, 7])!, /exatamente 6/);
  assert.match(validateNumbers([0, 2, 3, 4, 5, 6])!, /01 a 60/);
  assert.match(validateNumbers([1, 2, 3, 4, 5, 61])!, /01 a 60/);
  assert.match(validateNumbers([1, 2, 3, 4, 5, 2.5])!, /01 a 60/);
  assert.match(validateNumbers([1, 2, 3, 4, '5', 6])!, /01 a 60/);
  assert.match(validateNumbers([1, 1, 3, 4, 5, 6])!, /repetidas/);
  assert.ok(validateNumbers('1,2,3'));
});

test('normalizeNumbers ordena numericamente e completa com zero', () => {
  assert.equal(normalizeNumbers([48, 5, 12, 1, 35, 23]), '01-05-12-23-35-48');
  assert.equal(normalizeNumbers([10, 9, 2, 60, 33, 7]), '02-07-09-10-33-60');
});

test('conferência identifica quadra, quina e sena', () => {
  const result = [5, 10, 15, 20, 25, 30];
  assert.equal(countHits([5, 10, 15, 20, 25, 30], result), 6);
  assert.equal(prizeTier(countHits([5, 10, 15, 20, 25, 31], result)), 'quina');
  assert.equal(prizeTier(countHits([5, 10, 15, 20, 26, 31], result)), 'quadra');
  assert.equal(prizeTier(countHits([5, 10, 15, 21, 26, 31], result)), null);
  assert.equal(prizeTier(6), 'sena');
});

test('situação de pagamento', () => {
  assert.equal(paymentStatus(0, 0), 'none');
  assert.equal(paymentStatus(1200, 0), 'pending');
  assert.equal(paymentStatus(1200, 600), 'partial');
  assert.equal(paymentStatus(1200, 1200), 'paid');
});

test('parseMoneyToCents', () => {
  assert.equal(parseMoneyToCents('6,00'), 600);
  assert.equal(parseMoneyToCents('R$ 1.234,56'), 123456);
  assert.equal(parseMoneyToCents('5.5'), 550);
  assert.equal(parseMoneyToCents('7'), 700);
  assert.equal(parseMoneyToCents('abc'), null);
  assert.equal(parseMoneyToCents('-3'), null);
});

test('migrations criam as tabelas e o índice único parcial funciona', () => {
  const db = openDatabase(':memory:');
  const t = '2026-01-01T00:00:00.000Z';
  db.prepare(`INSERT INTO users (nickname, display_name, password_hash, role, created_at, updated_at)
    VALUES ('ana', 'Ana', 'x', 'participant', ?, ?)`).run(t, t);
  db.prepare(`INSERT INTO pools (name, contest_number, draw_date, price_cents, max_games_per_participant, status, created_at, updated_at)
    VALUES ('P', 1, '2026-12-31', 600, 5, 'open', ?, ?)`).run(t, t);
  const insert = db.prepare(`INSERT INTO games (pool_id, user_id, public_code, numbers, status, created_at, updated_at)
    VALUES (1, 1, ?, '01-02-03-04-05-06', ?, ?, ?)`);
  insert.run('AAA', 'active', t, t);
  assert.throws(() => insert.run('BBB', 'active', t, t), /UNIQUE/);
  insert.run('CCC', 'deleted', t, t); // excluído não conflita
});

test('validateNumbers respeita a quantidade de dezenas do bolão', () => {
  assert.equal(validateNumbers([1, 2, 3, 4, 5, 6, 7, 8], 8), null);
  assert.match(validateNumbers([1, 2, 3, 4, 5, 6], 8)!, /exatamente 8/);
  assert.equal(countHits([1, 2, 3, 4, 5, 6, 7, 8], [2, 4, 6, 8, 10, 12]), 4);
});

test('surpresinha: quantidade certa, sem repetir e evitando combinações usadas', () => {
  for (const count of [6, 10, 20]) {
    const g = randomGame(count, new Set())!;
    assert.equal(g.length, count);
    assert.equal(validateNumbers(g, count), null);
  }
  // Gerador "viciado": a primeira tentativa sai sempre igual; a combinação já usada deve ser evitada.
  const first = randomGame(6, new Set(), () => 0)!;
  let calls = 0;
  const seq = () => (calls++ < 59 ? 0 : Math.random());
  const g = randomGame(6, new Set([normalizeNumbers(first)]), seq)!;
  assert.notEqual(normalizeNumbers(g), normalizeNumbers(first));
});

test('Pix: CRC e payload idênticos ao exemplo oficial do Banco Central', () => {
  const ex = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.equal(crc16(ex), '1D3D');
  assert.equal(buildPixPayload({ key: '123e4567-e12b-12d1-a456-426655440000', name: 'Fulano de Tal', city: 'BRASILIA' }), ex + '1D3D');
});

test('Pix: valor fixo, acentos removidos e CRC válido', () => {
  const p = buildPixPayload({ key: 'fulano@exemplo.com', name: 'João da Conceição', city: 'São Paulo', amountCents: 1800, txid: 'BOLAO1U2' });
  assert.ok(p.includes('540518.00'), 'campo 54 com o valor');
  assert.ok(p.includes('5917Joao da Conceicao'));
  assert.ok(p.includes('6009Sao Paulo'));
  assert.ok(p.includes('0508BOLAO1U2'));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});

test('Pix: normalização da chave', () => {
  assert.equal(normalizePixKey(' Fulano@Exemplo.com '), 'fulano@exemplo.com');
  assert.equal(normalizePixKey('123.456.789-09'), '12345678909');
  assert.equal(normalizePixKey('12.345.678/0001-95'), '12345678000195');
  assert.equal(normalizePixKey('+55 (11) 99999-8888'), '+5511999998888');
  assert.equal(normalizePixKey('123E4567-E12B-12D1-A456-426655440000'), '123e4567-e12b-12d1-a456-426655440000');
  assert.equal(normalizePixKey('11 99999-8888'), null, 'telefone sem +55 é ambíguo com CPF');
  assert.equal(normalizePixKey('11999998888'), null, 'telefone sem +55 não passa no dígito do CPF');
  assert.equal(normalizePixKey('123.456.789-00'), null, 'CPF com dígito errado');
  assert.equal(normalizePixKey('abc'), null);
});
