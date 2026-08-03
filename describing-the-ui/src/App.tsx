import { useState } from "react";
import Gallery from "./components/Gallery";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ width: "100px" }}>
      <Gallery />
    </div>
  );
}

export default App;
