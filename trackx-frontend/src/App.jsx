import { AuthProvider } from "./context/AuthContext";
import AppRouter from "./routes/AppRouter";

// The AuthProvider wraps the entire application
// This allows you to access user and loading state from any component using useAuth()
function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;