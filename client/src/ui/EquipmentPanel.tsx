import { useState } from "react";
import type { Character, EquipmentSlot } from "@xstellar/shared";
import { EQUIPMENT } from "@xstellar/shared";
import { equipItem, unequipSlot } from "../api/character.js";

interface EquipmentPanelProps {
  token: string;
  character: Character;
  onCharacterChange: (character: Character) => void;
}

const SLOTS: Array<{
  slot: EquipmentSlot;
  label: string;
  idKey: "equippedWeaponId" | "equippedArmorId" | "equippedAccessoryId";
}> = [
  { slot: "weapon", label: "Weapon", idKey: "equippedWeaponId" },
  { slot: "armor", label: "Armor", idKey: "equippedArmorId" },
  { slot: "accessory", label: "Accessory", idKey: "equippedAccessoryId" },
];

export function EquipmentPanel({ token, character, onCharacterChange }: EquipmentPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ownedEquipment = Object.entries(character.inventory)
    .filter(([, count]) => count > 0)
    .map(([id]) => EQUIPMENT[id])
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  async function handleEquip(itemId: string) {
    setError(null);
    setBusy(true);
    try {
      onCharacterChange(await equipItem(token, itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to equip item");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnequip(slot: EquipmentSlot) {
    setError(null);
    setBusy(true);
    try {
      onCharacterChange(await unequipSlot(token, slot));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unequip item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="equipment-panel">
      <h3>Equipment</h3>
      {error && <p className="auth-error">{error}</p>}

      <ul className="equipment-slots">
        {SLOTS.map(({ slot, label, idKey }) => {
          const equippedId = character[idKey];
          const equippedItem = equippedId ? EQUIPMENT[equippedId] : undefined;
          return (
            <li key={slot}>
              <strong>{label}:</strong>{" "}
              {equippedItem ? (
                <>
                  {equippedItem.name} ({equippedItem.rarity}){" "}
                  <button disabled={busy} onClick={() => handleUnequip(slot)}>
                    Unequip
                  </button>
                </>
              ) : (
                <em>Empty</em>
              )}
            </li>
          );
        })}
      </ul>

      <h4>Owned Equipment</h4>
      <ul className="equipment-inventory">
        {ownedEquipment.length === 0 && <li>No equipment owned yet</li>}
        {ownedEquipment.map((item) => {
          const classLocked = item.classLock !== undefined && item.classLock !== character.jobClass;
          return (
            <li key={item.id}>
              {item.name} ({item.slot}, {item.rarity})
              {item.classLock && <span> — {item.classLock} only</span>}{" "}
              <button disabled={busy || classLocked} onClick={() => handleEquip(item.id)}>
                Equip
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
