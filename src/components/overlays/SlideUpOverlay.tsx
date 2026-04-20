import { useEffect, useState, type ReactNode } from 'react';

interface SlideUpOverlayProps {
  closing: boolean;
  onBackdropClick: () => void;
  children: ReactNode;
}

/**
 * SlideUpOverlay — shared wrapper for all four overlays.
 *
 * Positions the panel from `top: 33px` to the bottom of the viewport so the
 * header XP-bar strip remains visible above it. The transparent full-screen
 * backdrop sits below the panel (z-40) and dismisses the overlay when the
 * exposed header strip is clicked. The panel itself is z-50, above everything
 * including the footer.
 *
 * Entrance: slides up from off-screen on mount (220 ms ease-out).
 * Exit:     caller sets `closing=true`; the panel slides back down.
 *           After the transition, the parent unmounts this component.
 */
export function SlideUpOverlay({
  closing,
  onBackdropClick,
  children,
}: SlideUpOverlayProps) {
  const [entered, setEntered] = useState(false);

  // Delay the "entered" flag by one paint cycle so the browser renders the
  // off-screen initial position before the CSS transition begins.
  useEffect(() => {
    const id = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      {/* Transparent full-screen backdrop — z-40, sits above shell but below panel.
          Clicking anywhere (including the exposed header strip) dismisses the overlay. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onBackdropClick}
        aria-hidden="true"
      />

      {/* Slide-up panel — z-50, top edge ~33px from viewport top. */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          top: '33px',
          transform: entered && !closing ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 220ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
