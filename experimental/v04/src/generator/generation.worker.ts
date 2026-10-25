import { generateVerifiedLevel } from './level-generator.ts';

self.onmessage = (event: MessageEvent<{ seed: string }>): void => {
  try { self.postMessage(generateVerifiedLevel(event.data.seed)); }
  catch { self.postMessage({ status: 'ERROR' }); }
};
