type ProductType = {
  category: string;
  price: string;
  stocked: boolean;
  name: string;
};

function ProductRow({ product }: { product: ProductType }) {
  return (
    <div
      className="product-row"
      style={{ display: "flex", padding: "0 8px", border: "1px solid #C79B3A" }}
    >
      <p
        className="product-name"
        style={{
          flex: 1,
          textAlign: "left",
          color: product.stocked ? undefined : "red",
        }}
      >
        {product.name}
      </p>
      <p className="product-price" style={{ flex: 1 }}>
        {product.price}
      </p>
    </div>
  );
}

export default ProductRow;
