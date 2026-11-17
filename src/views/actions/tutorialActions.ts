/**
 * tutorialActions.ts — SRP: mostrar/resetar o tour de onboarding do Cockpit
 * legado (`helyx.tutorialDone2` em `globalState`). Extraído verbatim do
 * switch de `CockpitController._handleMessage`.
 */

import type { CommandHandler } from "./CommandHandler";
import { BRAND } from "../../data/brand.pure";

export const skipTutorialHandler: CommandHandler = {
  type: "skipTutorial",
  async handle(_msg, ctx) {
    await ctx.extensionContext.globalState.update(`${BRAND.name}.tutorialDone2`, true);
    await ctx.requestRefresh();
  },
};

export const resetTutorialHandler: CommandHandler = {
  type: "resetTutorial",
  async handle(_msg, ctx) {
    await ctx.extensionContext.globalState.update(`${BRAND.name}.tutorialDone2`, false);
    await ctx.requestRefresh();
  },
};
