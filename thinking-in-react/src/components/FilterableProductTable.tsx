import SearchBar from "./SearchBar";
import ProductTable from "./ProductTable";
import { useState } from "react";

type ProductType = {
  category: string;
  price: string;
  stocked: boolean;
  name: string;
};

type ProductTableProps = {
  products: ProductType[];
};

function FilterableProductTable({ products }: ProductTableProps) {
  const [filterText, setFilterText] = useState("");
  const [isStockOnly, setIsStockOnly] = useState(false);

  return (
    <div
      style={{
        border: "1px solid #7A8399",
        padding: "20px",
        gap: "12px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SearchBar
        filterText={filterText}
        isStockOnly={isStockOnly}
        onFilterTextChange={setFilterText}
        onIsStockOnlyChange={setIsStockOnly}
      />
      <ProductTable
        products={products}
        filterText={filterText}
        isStockOnly={isStockOnly}
      />
    </div>
  );
}

export default FilterableProductTable;
