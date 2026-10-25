import './ui/styles.css';
import { createInitialState, transition } from './game/game.ts';
import { generateLevel } from './generator/level-generator.ts';
import { mountUI } from './ui/app.ts';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root is missing');

let state = createInitialState();
const ui = mountUI(root, (action) => {
  state = transition(state, action, generateLevel);
  ui.render(state, true);
});

ui.render(state);

if (import.meta.hot) {
  import.meta.hot.dispose(() => ui.destroy());
}
