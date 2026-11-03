import useLenis from "./hooks/useLenis";
import AppRoutes from "./routes/AppRoutes";

export default function App() {
  useLenis();
  return <AppRoutes />;
}
