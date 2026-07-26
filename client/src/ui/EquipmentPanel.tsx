import { useState } from "react";
import type { Character, EquipmentInstance, EquipmentSlot } from "@xstellar/shared";
import { EQUIPMENT } from "@xstellar/shared";
import { equipItem, unequipSlot } from "../api/character.js";

interface EquipmentPanelProps {
  token: string;
  character: Character;
  equipmentInstances: EquipmentInstance[];
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

export function EquipmentPanel({ token, character, equipmentInstances, onCharacterChange }: EquipmentPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const instanceById = new Map(equipmentInstances.map((instance) => [instance.id, instance]));

  async function handleEquip(instanceId: string) {
    setError(null);
    setBusy(true);
    try {
      onCharacterChange(await equipItem(token, instanceId));
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
          const equippedInstanceId = character[idKey];
          const equippedInstance = equippedInstanceId ? instanceById.get(equippedInstanceId) : undefined;
          const equippedItem = equippedInstance ? EQUIPMENT[equippedInstance.catalogItemId] : undefined;
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
        {equipmentInstances.length === 0 && <li>No equipment owned yet</li>}
        {equipmentInstances.map((instance) => {
          const item = EQUIPMENT[instance.catalogItemId];
          if (!item) return null;
          const classLocked = item.classLock !== undefined && item.classLock !== character.jobClass;
          return (
            <li key={instance.id}>
              {item.name} ({item.slot}, {item.rarity})
              {item.classLock && <span> — {item.classLock} only</span>}{" "}
              <button disabled={busy || classLocked} onClick={() => handleEquip(instance.id)}>
                Equip
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
