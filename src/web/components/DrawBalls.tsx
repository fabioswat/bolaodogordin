import type { ReactNode } from 'react';
import type { PublicGame } from '../lib/api.ts';
import { pad } from '../lib/format.ts';

const TIER_LABEL: Record<number, string> = { 4: 'quadra', 5: 'quina', 6: 'sena' };

/**
 * As 6 bolas do sorteio no topo da página, ocupando toda a largura da faixa.
 * - Sem resultado: bolas com "?".
 * - Com resultado: as dezenas que o melhor jogo do bolão acertou ficam acesas (douradas);
 *   as que ele não acertou ficam vermelhas. Abaixo: legenda, faixas menores e `aside` (contadores).
 */
export function DrawBalls({ result, games, aside }: { result: number[] | null; games: PublicGame[]; aside?: ReactNode }) {
  if (!result) {
    return (
      <div className="draw-row" aria-label="Resultado ainda não sorteado">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="draw-ball draw-ball-pending" style={{ animationDelay: `${i * 0.25}s` }}>?</span>
        ))}
      </div>
    );
  }

  const best = games.reduce<PublicGame | null>((acc, g) => ((g.hits ?? 0) > (acc?.hits ?? -1) ? g : acc), null);
  const bestHits = best?.hits ?? 0;
  const bestCount = games.filter((g) => g.hits === bestHits).length;
  const lit = new Set(best ? best.numbers : []);

  return (
    <div className="space-y-4">
      <div className="draw-row">
        {result.map((n, i) => {
          const state = !best ? 'draw-ball-lit' : lit.has(n) ? 'draw-ball-lit' : 'draw-ball-out';
          return (
            <span key={n} className={`draw-ball draw-ball-reveal ${state}`} style={{ animationDelay: `${i * 0.15}s` }}
              title={!best ? undefined : lit.has(n) ? 'Acertada pelo melhor jogo' : 'Faltou acertar'}>
              {pad(n)}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          {best && (
            <p className="text-sm text-white/80">
              {bestHits === 0
                ? 'Nenhum jogo acertou dezenas sorteadas.'
                : <>Melhor jogo: <b className="text-white">{bestHits} acerto{bestHits > 1 ? 's' : ''}</b>
                  {TIER_LABEL[bestHits] ? <> ({TIER_LABEL[bestHits]})</> : <> · nenhum jogo premiado</>}
                  {bestCount > 1 ? ` · ${bestCount} jogos empatados` : <> · código <span className="font-mono">{best.code}</span></>}</>}
            </p>
          )}
          {/* Faixas premiadas abaixo do melhor jogo (ex.: melhor foi sena → quina e quadra, se houver). */}
          {[5, 4].filter((h) => h < bestHits).map((h, row) => {
            const tierGames = games.filter((g) => g.hits === h);
            if (tierGames.length === 0) return null;
            const hit = new Set(tierGames[0].numbers);
            const codes = tierGames.map((g) => g.code);
            return (
              <div key={h} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex gap-1">
                  {result.map((n, i) => (
                    <span key={n} className={`draw-ball-mini draw-ball-reveal ${hit.has(n) ? 'draw-ball-lit' : 'draw-ball-out'}`}
                      style={{ animationDelay: `${0.9 + row * 0.3 + i * 0.05}s` }}>{pad(n)}</span>
                  ))}
                </div>
                <span className="text-sm text-white/80">
                  <b className="capitalize text-white">{TIER_LABEL[h]}</b> · {tierGames.length} jogo{tierGames.length > 1 ? 's' : ''} ·{' '}
                  <span className="font-mono">{codes.slice(0, 3).join(', ')}</span>
                  {codes.length > 3 ? ` +${codes.length - 3}` : ''}
                </span>
              </div>
            );
          })}
        </div>
        {aside}
      </div>
    </div>
  );
}
