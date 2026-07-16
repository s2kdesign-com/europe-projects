"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Затваря с Escape, задържа фокуса вътре и го връща на елемента, който е отворил панела.
export function useFocusTrap(active, onClose) {
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    triggerRef.current = document.activeElement;
    const node = ref.current;
    if (!node) return;

    // Фокус върху първия смислен елемент.
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const first = focusables()[0] || node;
    // requestAnimationFrame – изчакваме съдържанието да се монтира.
    const raf = requestAnimationFrame(() => first.focus());

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener("keydown", onKey);
      // Връщаме фокуса на тригера.
      if (triggerRef.current && typeof triggerRef.current.focus === "function") {
        triggerRef.current.focus();
      }
    };
  }, [active, onClose]);

  return ref;
}
