import { DashboardPage } from "./pages/DashboardPage";
import "./styles/app.css";

export function App() {
  return (
    <main className="ledger-app">
      <DashboardPage title="Ledger Lite" subtitle="Personal finance mock" />
    </main>
  );
}

export default App;
