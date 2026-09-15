import { ToastProvider } from "./components";
import { Gallery } from "./gallery/Gallery";

function App() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}

export default App;
