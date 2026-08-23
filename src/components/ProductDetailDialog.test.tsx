import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProductDetailDialog } from "./ProductDetailDialog";

describe("ProductDetailDialog", () => {
  it("rendert veilig voordat een kant-en-klaar product is geselecteerd", () => {
    expect(() => renderToString(
      <ProductDetailDialog product={null} colors={[]} open={false} onOpenChange={vi.fn()} onAdd={vi.fn()} />,
    )).not.toThrow();
  });
});
