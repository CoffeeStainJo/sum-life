import { LoaderCircle } from 'lucide-react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={20} aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </div>
  );
}
