import Phaser from "phaser";
import { BattleScene } from "./scenes/BattleScene.js";

export function createPhaserGame(parent: HTMLElement, myUserId: string): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 720,
    height: 480,
    scene: [BattleScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });

  game.scene.start("BattleScene", { myUserId });
  return game;
}
