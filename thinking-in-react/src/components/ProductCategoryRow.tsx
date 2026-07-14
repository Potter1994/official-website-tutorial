type ProductCategoryRowProps = {
  category: string;
};

function ProductCategoryRow({ category }: ProductCategoryRowProps) {
  return <div style={{ border: "1px solid #61A89A" }}>{category}</div>;
}

export default ProductCategoryRow;
