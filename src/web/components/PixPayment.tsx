import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { formatCents } from '../lib/format.ts';

/** QR Code desenhado em SVG (sempre preto no branco, para qualquer app de banco ler, mesmo no modo escuro). */
function QrSvg({ text }: { text: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    }
    return { size: n + 8, path: d };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full rounded-lg bg-white" role="img" aria-label="QR Code do Pix"
      shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/** Cartão de pagamento: QR Code e "copia e cola" com o valor exato que falta pagar. */
export function PixPayment({ amountCents, payload }: { amountCents: number; payload: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // Navegadores antigos: seleciona o texto para a pessoa copiar manualmente.
      const el = document.getElementById('pix-copia-cola') as HTMLTextAreaElement | null;
      el?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="w-56 max-w-full shrink-0 rounded-xl border border-slate-200 bg-white p-2 sm:w-48">
          <QrSvg text={payload} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="font-bold text-brand-900">Pagar com Pix</h3>
            <p className="text-sm text-slate-500">
              Valor a pagar: <b className="text-lg text-brand-800 tabular-nums">{formatCents(amountCents)}</b>
            </p>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Abra o app do seu banco e escolha <b>Pix → Ler QR Code</b> ou <b>Pix copia e cola</b>.</li>
            <li>Confira o valor e o nome de quem recebe, e confirme.</li>
            <li>O administrador confirma o pagamento aqui no bolão.</li>
          </ol>
          <div>
            <label className="label" htmlFor="pix-copia-cola">Pix copia e cola</label>
            <textarea id="pix-copia-cola" readOnly rows={2} value={payload} onFocus={(e) => e.currentTarget.select()}
              className="input resize-none break-all font-mono text-xs" />
          </div>
          <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={copy}>
            {copied ? 'Copiado! Agora cole no app do banco' : 'Copiar Pix copia e cola'}
          </button>
        </div>
      </div>
    </section>
  );
}
