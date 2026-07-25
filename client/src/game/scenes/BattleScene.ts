import Phaser from "phaser";
import type { BattleState, Combatant } from "@xstellar/shared";
import { eventBus } from "../EventBus.js";

interface CombatantSlot {
  container: Phaser.GameObjects.Container;
  hpBarFill: Phaser.GameObjects.Rectangle;
  hpLabel: Phaser.GameObjects.Text;
}

const BAR_WIDTH = 160;

export class BattleScene extends Phaser.Scene {
  private myUserId = "";
  private allySlot?: CombatantSlot;
  private enemySlot?: CombatantSlot;
  private unsubscribe?: () => void;

  constructor() {
    super("BattleScene");
  }

  init(data: { myUserId: string }) {
    this.myUserId = data.myUserId;
  }

  create() {
    this.cameras.main.setBackgroundColor("#1b1035");

    this.allySlot = this.createSlot(180, 380, 0x3a86ff);
    this.enemySlot = this.createSlot(560, 160, 0xff595e);

    this.unsubscribe = eventBus.on("battle-state", (state) => this.renderState(state));
  }

  shutdown() {
    this.unsubscribe?.();
  }

  private createSlot(x: number, y: number, color: number): CombatantSlot {
    const container = this.add.container(x, y);

    const sprite = this.add.rectangle(0, 0, 72, 96, color).setStrokeStyle(2, 0xffffff);
    const nameLabel = this.add.text(0, -70, "", { fontSize: "14px", color: "#ffffff" }).setOrigin(0.5);

    const hpBarBg = this.add.rectangle(0, 60, BAR_WIDTH, 12, 0x222222).setStrokeStyle(1, 0xffffff);
    const hpBarFill = this.add.rectangle(-BAR_WIDTH / 2, 60, BAR_WIDTH, 12, 0x4caf50).setOrigin(0, 0.5);
    const hpLabel = this.add.text(0, 78, "", { fontSize: "12px", color: "#ffffff" }).setOrigin(0.5);

    container.add([sprite, nameLabel, hpBarBg, hpBarFill, hpLabel]);
    container.setData("nameLabel", nameLabel);

    return { container, hpBarFill, hpLabel };
  }

  private renderState(state: BattleState) {
    const ally = state.combatants.find((c) => c.character.ownerId === this.myUserId);
    const enemy = state.combatants.find((c) => c.character.ownerId !== this.myUserId);

    if (ally && this.allySlot) this.paintSlot(this.allySlot, ally);
    if (enemy && this.enemySlot) this.paintSlot(this.enemySlot, enemy);
  }

  private paintSlot(slot: CombatantSlot, combatant: Combatant) {
    const nameLabel = slot.container.getData("nameLabel") as Phaser.GameObjects.Text;
    nameLabel.setText(combatant.character.name);

    const { hp, maxHp } = combatant.character.stats;
    const ratio = maxHp > 0 ? Phaser.Math.Clamp(hp / maxHp, 0, 1) : 0;
    slot.hpBarFill.width = BAR_WIDTH * ratio;
    slot.hpBarFill.fillColor = ratio > 0.5 ? 0x4caf50 : ratio > 0.2 ? 0xffb703 : 0xd7263d;
    slot.hpLabel.setText(`${hp} / ${maxHp} HP`);

    slot.container.setAlpha(combatant.isDefeated ? 0.4 : 1);
  }
}
