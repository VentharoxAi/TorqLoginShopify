"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomerHeader } from "@/app/components/customer-header";
import type { CustomerHeaderCustomer } from "@/lib/customer-header";
import type { ShopifyStoreProduct } from "@/lib/shopify";

type Props = {
  products: ShopifyStoreProduct[] | null;
  customer: CustomerHeaderCustomer;
};

const CART_STORAGE_KEY = "torq-cart-v1";
const CHECKOUT_KEY_STORAGE_KEY = "torq-checkout-key-v1";
const STORE_BANNER_IMAGES = [
  { src: "/image1.jpg", alt: "TORQ steel ball bearing" },
  { src: "/image2.jpg", alt: "TORQ branded bearing" },
  { src: "/image3.jpg", alt: "TORQ sealed bearing" },
] as const;

type OrderConfirmation = {
  orderName: string;
  totalCartons: number;
  totalPrice: number;
  currencyCode: string;
};

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 2,
  }).format(amount);
}

function productPrice(amount: number | null): string {
  return amount === null ? "Price unavailable" : `Rs ${formatPrice(amount)}`;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L3.8 20l1.2-4.1a8.2 8.2 0 1 1 15.2-4.2Z" />
      <path d="M8.2 7.7c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.8 1.8c.1.2.1.4 0 .6l-.5.7c-.2.2-.2.4-.1.6.4.7 1 1.3 1.7 1.7.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.7-.1l1.7.8c.3.1.4.3.4.5 0 .3-.2 1.1-.7 1.5-.5.5-1.2.7-1.9.6-.8-.1-1.8-.5-2.9-1.4-1.5-1.2-2.5-2.7-2.8-3.8-.3-1 .1-2 .6-2.5Z" />
    </svg>
  );
}

export function Storefront({ products, customer }: Props) {
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartReady, setCartReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutKey, setCheckoutKey] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ShopifyStoreProduct | null>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);

  const productsByVariant = useMemo(
    () => new Map((products ?? []).map((product) => [product.variantId, product])),
    [products],
  );
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return products ?? [];
    return (products ?? []).filter((product) =>
      `${product.title} ${product.sku}`.toLocaleLowerCase().includes(query),
    );
  }, [products, search]);
  const cartItems = useMemo(
    () => Object.entries(quantities)
      .map(([variantId, quantity]) => ({
        product: productsByVariant.get(variantId),
        quantity,
      }))
      .filter((item): item is { product: ShopifyStoreProduct; quantity: number } =>
        Boolean(item.product && item.quantity > 0),
      ),
    [productsByVariant, quantities],
  );
  const totalCartons = cartItems.reduce((total, item) => total + item.quantity, 0);
  const totalAmount = cartItems.reduce(
    (total, item) => total + (item.product.cartonPrice ?? 0) * item.quantity,
    0,
  );

  useEffect(() => {
    for (const image of STORE_BANNER_IMAGES) {
      const preloadedImage = new window.Image();
      preloadedImage.src = image.src;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setBannerIndex((current) => (current + 1) % STORE_BANNER_IMAGES.length);
    }, 6000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!cartOpen && !selectedProduct) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCartOpen(false);
        setSelectedProduct(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cartOpen, selectedProduct]);

  useEffect(() => {
    setCheckoutKey(window.localStorage.getItem(CHECKOUT_KEY_STORAGE_KEY));
    try {
      const saved = window.localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const restored: Record<string, number> = {};
          for (const [variantId, quantity] of Object.entries(parsed)) {
            const product = productsByVariant.get(variantId);
            if (
              product &&
              product.cartonPrice !== null &&
              product.inventoryCartons > 0 &&
              Number.isSafeInteger(quantity) &&
              (quantity as number) > 0
            ) {
              restored[variantId] = Math.min(quantity as number, product.inventoryCartons);
            }
          }
          setQuantities(restored);
        }
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    }
    setCartReady(true);
  }, [productsByVariant]);

  useEffect(() => {
    if (cartReady) {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(quantities));
    }
  }, [cartReady, quantities]);

  function setQuantity(product: ShopifyStoreProduct, next: number) {
    const bounded = Math.max(0, Math.min(product.inventoryCartons, Math.trunc(next)));
    if (bounded === (quantities[product.variantId] ?? 0)) return;
    window.localStorage.removeItem(CHECKOUT_KEY_STORAGE_KEY);
    setCheckoutKey(null);
    setCheckoutError("");
    setQuantities((current) => {
      const updated = { ...current };
      if (bounded === 0) delete updated[product.variantId];
      else updated[product.variantId] = bounded;
      return updated;
    });
  }

  async function confirmOrder() {
    if (checkoutSubmitting || cartItems.length === 0) return;
    setCheckoutError("");
    setCheckoutSubmitting(true);
    const activeCheckoutKey = checkoutKey ?? window.crypto.randomUUID();
    if (!checkoutKey) {
      window.localStorage.setItem(CHECKOUT_KEY_STORAGE_KEY, activeCheckoutKey);
      setCheckoutKey(activeCheckoutKey);
    }

    try {
      const response = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutKey: activeCheckoutKey,
          items: cartItems.map(({ product, quantity }) => ({
            variantId: product.variantId,
            quantity,
          })),
        }),
      });
      const result = await response.json() as {
        error?: string;
        order?: OrderConfirmation;
      };
      if (!response.ok || !result.order) {
        throw new Error(result.error ?? "The order could not be confirmed. Your cart is safe.");
      }

      setOrderConfirmation(result.order);
      setCartOpen(false);
      setQuantities({});
      setCheckoutKey(null);
      window.localStorage.removeItem(CHECKOUT_KEY_STORAGE_KEY);
      window.localStorage.setItem(CART_STORAGE_KEY, "{}");
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "The order could not be confirmed. Your cart is safe.",
      );
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  function stepper(product: ShopifyStoreProduct, mobile = false) {
    const quantity = quantities[product.variantId] ?? 0;
    const disabled = product.inventoryCartons <= 0 || product.cartonPrice === null;
    return (
      <div className={`store-stepper${mobile ? " store-stepper-mobile" : ""}`}>
        <button
          type="button"
          aria-label={`Remove one carton of ${product.title}`}
          disabled={disabled || checkoutSubmitting || quantity === 0}
          onClick={() => setQuantity(product, quantity - 1)}
        >
          −
        </button>
        <span aria-live="polite">{quantity}</span>
        {mobile && <small>ctn</small>}
        <button
          type="button"
          aria-label={`Add one carton of ${product.title}`}
          disabled={disabled || checkoutSubmitting || quantity >= product.inventoryCartons}
          onClick={() => setQuantity(product, quantity + 1)}
        >
          +
        </button>
      </div>
    );
  }

  function productImage(product: ShopifyStoreProduct, className: string) {
    return product.imageUrl
      ? <img className={className} src={product.imageUrl} alt={product.imageAlt} loading="lazy" />
      : <div className={`${className} store-image-missing`} aria-label="Product image unavailable">Image unavailable</div>;
  }

  return (
    <main className="storefront">
      <CustomerHeader
        customer={customer}
        cartCount={totalCartons}
        onCartClick={() => setCartOpen(true)}
      />
      <section className="store-banner" aria-label="Featured products">
        {STORE_BANNER_IMAGES.map((image, index) => (
          <img
            className={`store-banner-image${index === bannerIndex ? " is-active" : ""}`}
            key={image.src}
            src={image.src}
            alt={index === bannerIndex ? image.alt : ""}
            aria-hidden={index !== bannerIndex}
            fetchPriority={index === 0 ? "high" : "auto"}
          />
        ))}
        {STORE_BANNER_IMAGES.length > 1 && (
          <div className="store-banner-dots" aria-label="Featured product slides">
            {STORE_BANNER_IMAGES.map((image, index) => (
              <button
                type="button"
                key={image.src}
                aria-label={`Show featured product ${index + 1}`}
                aria-current={index === bannerIndex}
                onClick={() => setBannerIndex(index)}
              />
            ))}
          </div>
        )}

      </section>

      <div className="store-search-bar">
        <label className="store-search-label">
          <span className="sr-only">Search name, SKU or bearing no.</span>
          <input
            ref={searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, SKU or bearing no."
          />
        </label>
        <Link href="/contact">Contact</Link>
      </div>

      {products === null ? (
        <p className="store-message" role="alert">Products are temporarily unavailable. Please try again.</p>
      ) : (
        <section className="store-product-list" aria-label="Products">
          {filteredProducts.length === 0 ? (
            <p className="store-message">{products.length === 0 ? "No active products are available." : "No products match your search."}</p>
          ) : filteredProducts.map((product) => {
            const inStock = product.inventoryCartons > 0;
            const quantity = quantities[product.variantId] ?? 0;
            const lineTotal = (product.cartonPrice ?? 0) * quantity;
            return (
              <article className="store-product-row" key={product.variantId}>
                <div className="store-product-identity">
                  {productImage(product, "store-product-image")}
                  <div className="store-product-title">
                    <h2>{product.title}</h2>
                    <span className={`store-stock ${inStock ? "is-in-stock" : "is-out-of-stock"}`}>
                      {inStock ? "In stock" : "Out of stock"}
                    </span>
                    {product.sku && <small>SKU: {product.sku}</small>}
                  </div>
                </div>
                <div className="store-desktop-pricing">
                  <span>Price per carton</span>
                  <strong>{productPrice(product.cartonPrice)}</strong>
                  {product.pricePerPiece !== null && (
                    <>
                      <span>Price per piece</span>
                      <strong>{productPrice(product.pricePerPiece)}</strong>
                    </>
                  )}
                  {product.piecesPerCarton !== null && (
                    <small>{product.piecesPerCarton} pieces per carton</small>
                  )}
                </div>
                {stepper(product)}
                <button className="store-details-button store-desktop-details" type="button" onClick={() => setSelectedProduct(product)}>
                  View details <span aria-hidden="true">→</span>
                </button>

                <div className="store-mobile-card">
                  <div className="store-mobile-left">
                    <div className="store-mobile-image-wrap">
                      {productImage(product, "store-mobile-image")}
                      <strong className="store-mobile-product-name">{product.title}</strong>
                    </div>
                    <span className={`store-stock ${inStock ? "is-in-stock" : "is-out-of-stock"}`}>
                      {inStock ? "In stock" : "Out of stock"}
                    </span>
                    <div className="store-mobile-price-box">
                      {product.pricePerPiece !== null && (
                        <p>Price Per Piece: <strong>{productPrice(product.pricePerPiece)}</strong></p>
                      )}
                      <p>Price Per Carton: <strong>{productPrice(product.cartonPrice)}</strong></p>
                    </div>
                  </div>
                  <div className="store-mobile-information">
                    {product.piecesPerCarton !== null && (
                      <p className="store-mobile-pieces">Pieces per Carton: <strong>{product.piecesPerCarton}</strong></p>
                    )}
                    <label className="store-carton-label">Choose number of cartons</label>
                    {stepper(product, true)}
                    <span className="store-total-label">Total amount for this size</span>
                    <div className="store-mobile-line-total">
                      <span>PKR</span><strong>{formatPrice(lineTotal)}</strong>
                    </div>
                    <button className="store-details-button store-mobile-details" type="button" onClick={() => setSelectedProduct(product)}>
                      View details
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <a className="store-floating-whatsapp" href="https://wa.me/923214073811" target="_blank" rel="noopener noreferrer" aria-label="Contact us on WhatsApp">
        <WhatsAppIcon />
      </a>
      <aside className="store-cart-bar" aria-label="Cart summary">
        <a className="store-cart-whatsapp" href="https://wa.me/923214073811" target="_blank" rel="noopener noreferrer" aria-label="Contact us on WhatsApp"><WhatsAppIcon /></a>
        <div className="store-cart-count"><span>Cart</span><strong>Total cartons: {totalCartons}</strong></div>
        <div className="store-cart-amount"><span>Total amount</span><strong>Rs {formatPrice(totalAmount)}</strong></div>
        <button className="store-cart-button" type="button" onClick={() => setCartOpen(true)}>
          View Cart
        </button>
      </aside>

      {cartOpen && (
        <div className="store-drawer-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCartOpen(false);
        }}>
          <aside
            className="store-drawer store-cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Your cart, ${totalCartons} cartons`}
          >
            <header className="store-cart-drawer-header">
              <h2>Your cart ({totalCartons})</h2>
              <button className="store-drawer-close" type="button" onClick={() => setCartOpen(false)} aria-label="Close cart">×</button>
            </header>
            {cartItems.length === 0 ? (
              <p className="store-cart-empty">Your cart is empty.</p>
            ) : (
              <div className="store-cart-drawer-items">
                {cartItems.map(({ product, quantity }) => (
                  <article className="store-cart-drawer-item" key={product.variantId}>
                    {productImage(product, "store-cart-product-image")}
                    <div className="store-cart-item-info">
                      <strong>{product.title}</strong>
                      {product.sku && <span>SKU: {product.sku}</span>}
                      <span>{productPrice(product.cartonPrice)} per carton</span>
                      <div className="store-cart-item-controls">
                        {stepper(product, true)}
                        <div className="store-cart-item-total">
                          <strong>{productPrice((product.cartonPrice ?? 0) * quantity)}</strong>
                          <button type="button" onClick={() => setQuantity(product, 0)}>Remove</button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <footer className="store-cart-drawer-footer">
              <div className="store-cart-drawer-total">
                <span>{totalCartons} {totalCartons === 1 ? "carton" : "cartons"}</span>
                <strong>Rs {formatPrice(totalAmount)}</strong>
              </div>
              {checkoutError && <p className="store-checkout-error" role="alert">{checkoutError}</p>}
              <button
                className="store-confirm-order"
                type="button"
                disabled={checkoutSubmitting || cartItems.length === 0}
                onClick={confirmOrder}
              >
                {checkoutSubmitting ? "Confirming order…" : "Confirm Order"}
              </button>
              <p>Payment is due later. We’ll confirm your order through TORQ Bearings.</p>
              <button className="store-continue-shopping" type="button" onClick={() => setCartOpen(false)}>
                Continue shopping
              </button>
            </footer>
          </aside>
        </div>
      )}

      {selectedProduct && (
        <div className="store-dialog-backdrop" onMouseDown={() => setSelectedProduct(null)}>
          <section
            className="store-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={selectedProduct.title}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="store-dialog-close" type="button" onClick={() => setSelectedProduct(null)} aria-label="Close dialog">×</button>
            <h2>{selectedProduct.title}</h2>
            <div className="store-details-content">
              {productImage(selectedProduct, "store-details-image")}
              <div>
                {selectedProduct.sku && <p>SKU: <strong>{selectedProduct.sku}</strong></p>}
                <p>Stock: <strong>{selectedProduct.inventoryCartons} cartons</strong></p>
                <p>Price per carton: <strong>{productPrice(selectedProduct.cartonPrice)}</strong></p>
                {selectedProduct.pricePerPiece !== null && <p>Price per piece: <strong>{productPrice(selectedProduct.pricePerPiece)}</strong></p>}
                {selectedProduct.piecesPerCarton !== null && <p>Pieces per carton: <strong>{selectedProduct.piecesPerCarton}</strong></p>}
                <p>Quantity: {stepper(selectedProduct, true)}</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {orderConfirmation && (
        <div className="store-drawer-backdrop store-order-confirmation-backdrop">
          <section className="store-order-confirmation" role="dialog" aria-modal="true" aria-labelledby="order-confirmed-title">
            <h1 id="order-confirmed-title">Order confirmed</h1>
            <p className="store-confirmed-order-number">Order {orderConfirmation.orderName}</p>
            <div className="store-confirmed-summary">
              <span>Total cartons</span>
              <strong>{orderConfirmation.totalCartons}</strong>
              <span>Total amount</span>
              <strong>{orderConfirmation.currencyCode} {formatPrice(orderConfirmation.totalPrice)}</strong>
            </div>
            <a href="https://wa.me/923214073811" target="_blank" rel="noopener noreferrer">
              WhatsApp support
            </a>
            <button type="button" onClick={() => setOrderConfirmation(null)}>Continue shopping</button>
          </section>
        </div>
      )}
    </main>
  );
}
