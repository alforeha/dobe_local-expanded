import type { IdeaLayout, MainIdeaLayout } from './brainstormLayout';

export function hitTestMainIdea(
  screenX: number,
  screenY: number,
  layouts: MainIdeaLayout[],
  worldToScreen: (wx: number, wy: number) => { x: number; y: number },
  hitPadding: number = 12,
): string | null {
  const hit = layouts.find((layout) => {
    const screen = worldToScreen(layout.x, layout.y);
    const dx = screenX - screen.x;
    const dy = screenY - screen.y;

    return Math.sqrt(dx * dx + dy * dy) <= layout.radius + hitPadding;
  });

  return hit?.id ?? null;
}

export function hitTestIdea(
  screenX: number,
  screenY: number,
  layouts: IdeaLayout[],
  worldToScreen: (wx: number, wy: number) => { x: number; y: number },
  hitPadding: number = 12,
): string | null {
  const hit = layouts.find((layout) => {
    const screen = worldToScreen(layout.x, layout.y);
    const dx = screenX - screen.x;
    const dy = screenY - screen.y;

    return Math.sqrt(dx * dx + dy * dy) <= layout.radius + hitPadding;
  });

  return hit?.id ?? null;
}
