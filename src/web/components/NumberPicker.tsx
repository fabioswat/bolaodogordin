import { MAX_NUMBER, NUMBERS_PER_GAME, pad } from '../../shared/rules.ts';

interface Props {
  value: number[];
  onChange: (numbers: number[]) => void;
  disabled?: boolean;
}

/** Grade 01–60 em formato de volante; permite escolher exatamente 6 dezenas. */
export function NumberPicker({ value, onChange, disabled }: Props) {
  const selected = new Set(value);
  const full = value.length >= NUMBERS_PER_GAME;

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
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className={value.length === NUMBERS_PER_GAME ? 'font-semibold text-brand-700' : 'text-slate-500'}>
          {value.length} de {NUMBERS_PER_GAME} dezenas
        </span>
        {value.length > 0 && !disabled && (
          <button type="button" className="text-sm font-semibold text-slate-500 hover:text-red-600" onClick={() => onChange([])}>
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}
