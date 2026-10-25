/** Future integration boundary only. No SDK, ad simulation, or reward is active. */
export interface AdRewardProvider {
  readonly available: boolean;
  requestReward(placement: 'hint' | 'extra-undo'): Promise<{ rewarded: boolean }>;
}
export const adRewardProvider: AdRewardProvider = {
  available: false,
  async requestReward() { return { rewarded: false }; },
};
