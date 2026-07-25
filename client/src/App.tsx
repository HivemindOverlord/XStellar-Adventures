import { useAuth } from "./state/AuthContext.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { GameScreen } from "./screens/GameScreen.js";

export function App() {
  const { auth } = useAuth();
  return auth ? <GameScreen /> : <AuthScreen />;
}
