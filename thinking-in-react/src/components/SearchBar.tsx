type filterText = {
  filterText: string;
  isStockOnly: boolean;
  onFilterTextChange: (value: string) => void;
  onIsStockOnlyChange: (value: boolean) => void;
};

function SearchBar({
  filterText,
  isStockOnly,
  onFilterTextChange,
  onIsStockOnlyChange,
}: filterText) {
  return (
    <div
      style={{
        border: "1px solid #7299CC",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        alignItems: "flex-start",
      }}
    >
      <div className="search-input">
        <input
          type="text"
          placeholder="Search ..."
          style={{ backgroundColor: "#fff", padding: "4px", color: "#333" }}
          value={filterText}
          onChange={(e) => {
            onFilterTextChange(e.target.value);
          }}
        />
      </div>
      <div className="search-filter" style={{ display: "flex" }}>
        <label>
          <input
            type="checkbox"
            name="stock"
            checked={isStockOnly}
            onChange={(e) => {
              onIsStockOnlyChange(e.target.checked);
            }}
          />
          Only show products in stock
        </label>
        <span style={{ fontSize: "12px" }}></span>
      </div>
    </div>
  );
}

export default SearchBar;
