import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateNumbers, normalizeNumbers, countHits, prizeTier, paymentStatus, parseMoneyToCents,
} from '../src/shared/rules.ts';
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
