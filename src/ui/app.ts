import type { GameAction, GameState } from '../game/types.ts';

const arrow = '<span aria-hidden="true">↗</span>';

function artwork(): string {
  return `
    <div class="artwork" aria-hidden="true">
      <span class="artwork-caption">ЭСКИЗ № 001</span>
      <div class="artwork-orbit orbit-one"></div>
      <div class="artwork-orbit orbit-two"></div>
      <div class="specimen specimen-square"><i></i></div>
      <div class="specimen specimen-circle"><i></i></div>
      <div class="specimen specimen-striped"><i></i></div>
      <div class="specimen specimen-arch"><i></i></div>
      <span class="artwork-star star-one">✳</span>
      <span class="artwork-star star-two">✳</span>
      <span class="artwork-label">кое-что интересное<br>только начинается</span>
      <span class="artwork-dot"></span>
    </div>`;
}

function startScreen(): string {
  return `
    <main class="main start-screen" aria-labelledby="screen-title">
      <section class="intro">
        <p class="eyebrow"><span></span> ИГРА В РАЗРАБОТКЕ</p>
        <h1 id="screen-title" tabindex="-1">Секретная<br><span>сортировка</span><span class="title-dot">.</span></h1>
        <p class="description">Первый взгляд на будущую игру.<br>История только начинается.</p>
        <button class="button button-primary" type="button" data-action="open-workspace">
          Открыть прототип ${arrow}
        </button>
        <p class="prototype-note">Пока без игровых правил — они ещё впереди.</p>
      </section>
      ${artwork()}
    </main>`;
}

function workspaceScreen(): string {
  return `
    <main class="main workspace-screen" aria-labelledby="screen-title">
      <section class="workspace">
        <p class="eyebrow"><span></span> ПРОТОТИП</p>
        <div class="workspace-symbol" aria-hidden="true"><span></span><i></i></div>
        <h1 id="screen-title" tabindex="-1">Место для<br>будущей игры<span class="title-dot">.</span></h1>
        <p class="description">Игровое поле появится здесь.<br>Механика и правила ещё не заданы.</p>
        <button class="button button-primary" type="button" data-action="return-to-start">
          <span aria-hidden="true">←</span> На главный экран
        </button>
      </section>
    </main>`;
}

/** UI renders state and emits actions; it does not implement game rules. */
export function mountUI(root: HTMLElement, onAction: (action: GameAction) => void) {
  root.innerHTML = `
    <div class="app-shell">
      <header class="header">
        <div class="brand" aria-label="Секретная сортировка">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span>секретная<br>сортировка</span>
        </div>
        <span class="version"><span></span> ПРОТОТИП 0.1</span>
      </header>
      <div id="screen"></div>
      <footer class="footer">
        <span>МАЛЕНЬКОЕ НАЧАЛО. МНОГО ВОЗМОЖНОСТЕЙ.</span>
        <span class="devices"><svg aria-hidden="true" width="31" height="20" viewBox="0 0 31 20" fill="none"><rect x="1" y="2" width="18" height="12" rx="2" stroke="currentColor"/><path d="M7 18h6m-3-4v4" stroke="currentColor"/><rect x="23" y="5" width="7" height="13" rx="1.5" stroke="currentColor"/></svg>ПК и смартфоны</span>
      </footer>
    </div>`;

  const screen = root.querySelector<HTMLElement>('#screen');
  if (!screen) throw new Error('Screen container is missing');

  function handleClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button[data-action]');
    if (!button || !root.contains(button)) return;
    const action = button.dataset.action;
    if (action === 'open-workspace' || action === 'return-to-start') {
      onAction({ type: action });
    }
  }

  root.addEventListener('click', handleClick);

  return {
    render(state: GameState, moveFocus = false): void {
      screen.innerHTML = state.screen === 'start' ? startScreen() : workspaceScreen();
      if (moveFocus) screen.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    },
    destroy(): void {
      root.removeEventListener('click', handleClick);
      root.replaceChildren();
    },
  };
}
