import { useEffect, useState } from "react";
import { useAuth } from "./state/AuthContext.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { CharacterSelectScreen } from "./screens/CharacterSelectScreen.js";
import { GameScreen } from "./screens/GameScreen.js";

export function App() {
  const { auth } = useAuth();
  const [characterSelected, setCharacterSelected] = useState(false);

  useEffect(() => {
    if (!auth) setCharacterSelected(false);
  }, [auth]);

  if (!auth) return <AuthScreen />;

  if (!characterSelected) {
    return <CharacterSelectScreen token={auth.token} onSelected={() => setCharacterSelected(true)} />;
  }

  return <GameScreen onChangeCharacter={() => setCharacterSelected(false)} />;
}
