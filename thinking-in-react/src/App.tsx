import FilterableProductTable from "./components/FilterableProductTable";
import { data } from "./data";

function App() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <FilterableProductTable products={data} />
    </div>
  );
}

export default App;
