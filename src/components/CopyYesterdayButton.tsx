import { Copy } from 'lucide-react';
import { fmt } from '../lib/nutrition';

interface Props {
  entryCount: number;
  calories: number;
  onCopy: () => void;
}

export function CopyYesterdayButton({ entryCount, calories, onCopy }: Props) {
  return (
    <button type="button" className="copy-yesterday" onClick={onCopy}>
      <span className="copy-yesterday__icon">
        <Copy size={20} aria-hidden="true" />
      </span>
      <span className="copy-yesterday__text">
        <strong>Copy yesterday&rsquo;s journal</strong>
        <small>
          {entryCount} {entryCount === 1 ? 'item' : 'items'} · {fmt(calories)} kcal
        </small>
      </span>
    </button>
  );
}
