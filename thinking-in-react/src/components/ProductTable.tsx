// import { useMemo } from "react";
import ProductCategoryRow from "./ProductCategoryRow";
import ProductRow from "./ProductRow";

type ProductType = {
  category: string;
  price: string;
  stocked: boolean;
  name: string;
};

type ProductTableProps = {
  products: ProductType[];
  filterText: string;
  isStockOnly: boolean;
};

// type GroupedProductsType = Record<string, ProductType[]>;

function ProductTable({
  products,
  filterText,
  isStockOnly,
}: ProductTableProps) {
  const rows: React.ReactNode[] = [];
  let lastCategory: null | string = null;

  products
    .filter((product) => (isStockOnly ? product.stocked : true))
    .forEach((product) => {
      if (!product.name.toLowerCase().includes(filterText.toLowerCase()))
        return;

      if (isStockOnly && !product.stocked) return;

      if (product.category !== lastCategory) {
        rows.push(
          <ProductCategoryRow
            key={product.category}
            category={product.category}
          />,
        );
      }
      rows.push(<ProductRow key={product.name} product={product} />);
      lastCategory = product.category;
    });

  return (
    <div
      style={{
        border: "1px solid #A886C0",
        padding: "6px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div className="info" style={{ display: "flex" }}>
        <p style={{ flex: 1 }}>Name</p>
        <p style={{ flex: 1 }}>Price</p>
      </div>
      <div>{rows}</div>
    </div>
  );
}
// function ProductTable({ products }: ProductTableProps) {
//   const groupedProducts = useMemo(
//     () =>
//       products.reduce<GroupedProductsType>((prev, curr) => {
//         if (!prev[curr.category]) {
//           prev[curr.category] = [];
//         }
//         prev[curr.category].push(curr);
//         return prev;
//       }, {}),
//     [products],
//   );

//   return (
//     <div
//       style={{
//         border: "1px solid #A886C0",
//         padding: "6px",
//         display: "flex",
//         flexDirection: "column",
//         gap: "6px",
//       }}
//     >
//       <div className="info" style={{ display: "flex" }}>
//         <p style={{ flex: 1 }}>Name</p>
//         <p style={{ flex: 1 }}>Price</p>
//       </div>
//       {Object.keys(groupedProducts).map((category) => (
//         <div
//           key={category}
//           style={{
//             display: "flex",
//             flexDirection: "column",
//             gap: "6px",
//           }}
//         >
//           <ProductCategoryRow category={category} />
//           {groupedProducts[category].map((product) => (
//             <ProductRow product={product} key={product.name} />
//           ))}
//         </div>
//       ))}
//     </div>
//   );
// }

export default ProductTable;
