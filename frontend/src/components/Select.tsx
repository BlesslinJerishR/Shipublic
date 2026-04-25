'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
}

function SelectImpl({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  size = 'md',
  align = 'start',
  fullWidth = false,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  align?: 'start' | 'end';
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const current = useMemo(() => options.find((o) => o.value === value), [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIdx((i) => Math.min(options.length - 1, (i < 0 ? -1 : i) + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, (i < 0 ? options.length : i) - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusIdx >= 0 && focusIdx < options.length) {
          onChange(options[focusIdx].value);
          setOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, focusIdx, options, onChange]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setFocusIdx(idx);
    }
  }, [open, value, options]);

  const cls = useMemo(
    () =>
      [
        styles.wrap,
        fullWidth ? styles.full : '',
        disabled ? styles.disabled : '',
        size === 'sm' ? styles.sm : '',
        className || '',
      ]
        .filter(Boolean)
        .join(' '),
    [fullWidth, disabled, size, className],
  );

  const onTriggerClick = useCallback(() => {
    if (!disabled) setOpen((o) => !o);
  }, [disabled]);

  return (
    <div className={cls} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={onTriggerClick}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className={styles.triggerLabel}>
          {current ? current.label : <span className={styles.placeholder}>{placeholder}</span>}
        </span>
        <ChevronDown size={14} className={`${styles.chev} ${open ? styles.chevOpen : ''}`} />
      </button>

      {open && (
        <div
          className={`${styles.menu} ${align === 'end' ? styles.menuEnd : ''}`}
          role="listbox"
          ref={listRef}
        >
          {options.map((opt, i) => {
            const selected = opt.value === value;
            const focused = i === focusIdx;
            return (
              <button
                type="button"
                key={opt.value}
                role="option"
                aria-selected={selected}
                className={`${styles.option} ${selected ? styles.optionSelected : ''} ${focused ? styles.optionFocused : ''}`}
                onMouseEnter={() => setFocusIdx(i)}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span className={styles.optionMain}>
                  <span className={styles.optionLabel}>{opt.label}</span>
                  {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
                </span>
                {selected && <Check size={14} className={styles.optionCheck} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const Select = memo(SelectImpl);
