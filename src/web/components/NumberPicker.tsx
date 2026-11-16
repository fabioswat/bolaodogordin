import type { ReactNode } from 'react';
import { MAX_NUMBER, NUMBERS_PER_GAME, pad } from '../../shared/rules.ts';

interface Props {
  value: number[];
  onChange: (numbers: number[]) => void;
  disabled?: boolean;
  /** Quantidade de dezenas a escolher (padrão 6). */
  count?: number;
  /** Ação extra ao lado do contador (ex.: botão Surpresinha). */
  extra?: ReactNode;
}

/** Grade 01–60 em formato de volante; permite escolher exatamente `count` dezenas. */
export function NumberPicker({ value, onChange, disabled, count = NUMBERS_PER_GAME, extra }: Props) {
  const selected = new Set(value);
  const full = value.length >= count;

  const toggle = (n: number) => {
    if (selected.has(n)) onChange(value.filter((x) => x !== n));
    else if (!full) onChange([...value, n].sort((a, b) => a - b));
  };

  return (
    <div>
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
        {Array.from({ length: MAX_NUMBER }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className="picker-cell"
            aria-pressed={selected.has(n)}
            aria-label={`Dezena ${pad(n)}`}
            disabled={disabled || (full && !selected.has(n))}
            onClick={() => toggle(n)}
          >
            {pad(n)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={value.length === count ? 'font-semibold text-brand-700' : 'text-slate-500'}>
          {value.length} de {count} dezenas
        </span>
        <div className="flex items-center gap-3">
          {value.length > 0 && !disabled && (
            <button type="button" className="text-sm font-semibold text-slate-500 hover:text-red-600" onClick={() => onChange([])}>
              Limpar
            </button>
          )}
          {extra}
        </div>
      </div>
    </div>
  );
}
