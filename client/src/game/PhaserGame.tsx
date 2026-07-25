import { useEffect, useRef } from "react";
import { createPhaserGame } from "./main.js";

export function PhaserGame({ myUserId }: { myUserId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const game = createPhaserGame(containerRef.current, myUserId);
    return () => game.destroy(true);
  }, [myUserId]);

  return <div ref={containerRef} className="phaser-container" />;
}
