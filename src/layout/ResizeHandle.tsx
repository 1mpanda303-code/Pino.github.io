import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

type Props = {
  orientation: 'vertical' | 'horizontal';
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  defaultValue: number;
  className?: string;
  step?: number;
  onChange: (value: number, committed: boolean) => void;
};

type DragState = { pointerId: number; origin: number; startValue: number; lastValue: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function ResizeHandle({ orientation, label, value, minimum, maximum, defaultValue, className = '', step = 12, onChange }: Props) {
  const drag = useRef<DragState | null>(null);
  const coordinate = (event: ReactPointerEvent<HTMLDivElement>) => orientation === 'vertical' ? event.clientX : event.clientY;

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    document.body.classList.remove('is-resizing-layout');
    onChange(active.lastValue, true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      className={`resize-handle ${orientation} ${className}`.trim()}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={Math.round(minimum)}
      aria-valuemax={Math.round(maximum)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} 像素`}
      onDoubleClick={() => onChange(defaultValue, true)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const current = clamp(value, minimum, maximum);
        drag.current = { pointerId: event.pointerId, origin: coordinate(event), startValue: current, lastValue: current };
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add('is-resizing-layout');
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const next = clamp(active.startValue + coordinate(event) - active.origin, minimum, maximum);
        active.lastValue = next;
        onChange(next, false);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={(event) => {
        let next: number | null = null;
        if (event.key === 'Home') next = minimum;
        if (event.key === 'End') next = maximum;
        if (event.key === 'Enter') next = defaultValue;
        if (orientation === 'vertical' && event.key === 'ArrowLeft') next = value - step;
        if (orientation === 'vertical' && event.key === 'ArrowRight') next = value + step;
        if (orientation === 'horizontal' && event.key === 'ArrowUp') next = value - step;
        if (orientation === 'horizontal' && event.key === 'ArrowDown') next = value + step;
        if (next === null) return;
        event.preventDefault();
        onChange(clamp(next, minimum, maximum), true);
      }}
    >
      <span aria-hidden="true" />
    </div>
  );
}
