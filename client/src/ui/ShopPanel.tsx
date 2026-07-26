import { useEffect, useMemo, useState } from "react";
import type { Character, EquipmentItem, Item, Rarity, ShopStateResponse } from "@xstellar/shared";
import { EQUIPMENT, ITEMS } from "@xstellar/shared";
import { buyItem, fetchShop, sellItems } from "../api/shop.js";

interface ShopPanelProps {
  token: string;
  character: Character;
  onCharacterChange: (character: Character) => void;
}

const RARITY_DISPLAY_ORDER: Rarity[] = ["red", "orange", "purple", "blue", "green", "white"];

export function ShopPanel({ token, character, onCharacterChange }: ShopPanelProps) {
  const [shop, setShop] = useState<ShopStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyQuantities, setBuyQuantities] = useState<Record<string, number>>({});
  const [sellQuantities, setSellQuantities] = useState<Record<string, number>>({});
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadShop();
  }, [token]);

  async function loadShop() {
    setLoading(true);
    setError(null);
    try {
      setShop(await fetchShop(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shop");
    } finally {
      setLoading(false);
    }
  }

  const rotationByRarity = useMemo(() => {
    const grouped = new Map<Rarity, EquipmentItem[]>();
    for (const entry of shop?.catalog.equipmentRotation ?? []) {
      const item = EQUIPMENT[entry.itemId];
      if (!item) continue;
      const list = grouped.get(item.rarity) ?? [];
      list.push(item);
      grouped.set(item.rarity, list);
    }
    return grouped;
  }, [shop]);

  const priceOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of shop?.catalog.generalGoods ?? []) map.set(entry.itemId, entry.price);
    for (const entry of shop?.catalog.equipmentRotation ?? []) map.set(entry.itemId, entry.price);
    return map;
  }, [shop]);

  async function handleBuy(itemId: string) {
    const quantity = buyQuantities[itemId] ?? 1;
    setError(null);
    setBusy(true);
    try {
      const updated = await buyItem(token, itemId, quantity);
      onCharacterChange(updated);
      await loadShop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to buy item");
    } finally {
      setBusy(false);
    }
  }

  async function handleSellLines(lines: { itemId: string; quantity: number }[]) {
    if (lines.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const result = await sellItems(token, lines);
      onCharacterChange(result.character);
      setSelectedForBatch(new Set());
      await loadShop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sell items");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(itemId: string) {
    setSelectedForBatch((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const ownedEntries = Object.entries(character.inventory).filter(([, count]) => count > 0);

  if (loading) return <div className="shop-panel">Loading shop…</div>;

  return (
    <div className="shop-panel">
      <h3>Shop</h3>
      <p className="shop-currency">{shop?.currency ?? character.currency} Driftmetal</p>
      {error && <p className="auth-error">{error}</p>}

      <h4>General Goods</h4>
      <ul className="shop-listing">
        {(shop?.catalog.generalGoods ?? []).map((entry) => {
          const item: Item | undefined = ITEMS[entry.itemId];
          if (!item) return null;
          return (
            <li key={item.id}>
              <span>
                {item.name} — {entry.price} Driftmetal
              </span>
              <input
                type="number"
                min={1}
                value={buyQuantities[item.id] ?? 1}
                onChange={(e) =>
                  setBuyQuantities((prev) => ({ ...prev, [item.id]: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
              <button disabled={busy} onClick={() => handleBuy(item.id)}>
                Buy
              </button>
            </li>
          );
        })}
      </ul>

      <h4>Equipment Rotation ({shop?.catalog.rotationDate})</h4>
      {RARITY_DISPLAY_ORDER.map((rarity) => {
        const items = rotationByRarity.get(rarity);
        if (!items || items.length === 0) return null;
        return (
          <div key={rarity}>
            <h5>{rarity[0].toUpperCase() + rarity.slice(1)}</h5>
            <ul className="shop-listing">
              {items.map((item) => {
                const classLocked = item.classLock !== undefined && item.classLock !== character.jobClass;
                return (
                  <li key={item.id}>
                    <span>
                      {item.name} ({item.slot}) — {priceOf.get(item.id) ?? "?"} Driftmetal
                      {item.classLock && <span> — {item.classLock} only</span>}
                    </span>
                    <button disabled={busy || classLocked} onClick={() => handleBuy(item.id)}>
                      Buy
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <h4>Sell</h4>
      <ul className="shop-listing">
        {ownedEntries.length === 0 && <li>Nothing to sell</li>}
        {ownedEntries.map(([itemId, owned]) => {
          const catalogItem: EquipmentItem | Item | undefined = EQUIPMENT[itemId] ?? ITEMS[itemId];
          if (!catalogItem) return null;
          const refundEligible = shop?.refundEligible[itemId] ?? 0;
          const quantity = sellQuantities[itemId] ?? owned;
          return (
            <li key={itemId}>
              <input type="checkbox" checked={selectedForBatch.has(itemId)} onChange={() => toggleSelected(itemId)} />
              <span>
                {catalogItem.name} ×{owned} ({Math.min(refundEligible, owned)} at full refund today)
              </span>
              <input
                type="number"
                min={1}
                max={owned}
                value={quantity}
                onChange={(e) =>
                  setSellQuantities((prev) => ({
                    ...prev,
                    [itemId]: Math.min(owned, Math.max(1, Number(e.target.value) || 1)),
                  }))
                }
              />
              <button disabled={busy} onClick={() => handleSellLines([{ itemId, quantity }])}>
                Sell
              </button>
              <button disabled={busy} onClick={() => handleSellLines([{ itemId, quantity: owned }])}>
                Sell All
              </button>
            </li>
          );
        })}
      </ul>
      <button
        disabled={busy || selectedForBatch.size === 0}
        onClick={() =>
          handleSellLines(
            [...selectedForBatch].map((itemId) => ({
              itemId,
              quantity: sellQuantities[itemId] ?? character.inventory[itemId] ?? 0,
            })),
          )
        }
      >
        Sell Selected
      </button>
    </div>
  );
}
