/** Fit the rendered board to the currently visible browser area. CSS svh alone
 * can keep its original size while Android browser panels change visibility. */
export function observeViewport(root: HTMLElement): { fit: () => void; destroy: () => void } {
  let frame = 0;
  let observed: HTMLElement | null = null;
  const observer = new ResizeObserver(schedule);
  function fit(): void {
    const shell = root.querySelector<HTMLElement>('.app-shell.is-playing');
    if (!shell) { observer.disconnect(); observed = null; return; }
    if (shell !== observed) { observer.disconnect(); observer.observe(shell); observed = shell; }
    const viewport = window.visualViewport;
    const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
    shell.style.width = `${width}px`; shell.style.height = `${height}px`;
    shell.style.left = `${viewport?.offsetLeft ?? 0}px`; shell.style.top = `${viewport?.offsetTop ?? 0}px`;
    shell.classList.toggle('is-compact', height < 560);
    let cell = width <= 680 ? Math.min(40, (width - 64) / 10) : 50;
    const style = getComputedStyle(shell), right = shell.getBoundingClientRect().right - parseFloat(style.paddingRight), bottom = shell.getBoundingClientRect().bottom - parseFloat(style.paddingBottom);
    for (let i = 0; i < 4; i++) {
      shell.style.setProperty('--cell', `${Math.floor(cell * 16) / 16}px`);
      const boxes = [...shell.querySelectorAll<HTMLElement>('.board, .reserve-panel, .game-controls, .replay-controls, .game-header')].map(el => el.getBoundingClientRect());
      const overflowX = Math.max(0, ...boxes.map(box => box.right - right)), overflowY = Math.max(0, ...boxes.map(box => box.bottom - bottom));
      if (overflowX < .25 && overflowY < .25) break;
      cell = Math.max(16, cell - Math.max(overflowX / 10, overflowY / 12) - .125);
    }
    shell.dataset.cellSize = String(cell);
  }
  function schedule(): void { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); }
  window.addEventListener('resize', schedule); window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
  return { fit() { fit(); schedule(); }, destroy() { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); window.removeEventListener('orientationchange', schedule); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); } };
}
