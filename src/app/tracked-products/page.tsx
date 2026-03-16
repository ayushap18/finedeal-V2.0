"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import Link from "next/link";

interface Product {
  id: string;
  name: string;
  platform: string;
  category: string;
  current_price: number;
  original_price: number;
  lowest_price: number;
  highest_price: number;
  last_checked: string;
  status: string;
  url?: string;
  created_at: string;
}

interface DisplayProduct {
  id: string;
  name: string;
  category: string;
  platform: string;
  currentPrice: string;
  lowestPrice: string;
  lastUpdated: string;
  status: "Active" | "Pending";
  url?: string;
}

const defaultProducts: DisplayProduct[] = [
  {
    id: "1",
    name: "Samsung Galaxy S24 Ultra 256GB",
    category: "Smartphone",
    platform: "Amazon",
    currentPrice: "\u20B91,29,999",
    lowestPrice: "\u20B91,09,999",
    lastUpdated: "2 min ago",
    status: "Active" as const,
  },
  {
    id: "2",
    name: "iPhone 16 Pro Max 512GB",
    category: "Smartphone",
    platform: "Flipkart",
    currentPrice: "\u20B91,79,900",
    lowestPrice: "\u20B91,64,900",
    lastUpdated: "15 min ago",
    status: "Active" as const,
  },
  {
    id: "3",
    name: "MacBook Air M3 15-inch",
    category: "Laptop",
    platform: "Amazon",
    currentPrice: "\u20B91,34,990",
    lowestPrice: "\u20B91,14,990",
    lastUpdated: "1 hour ago",
    status: "Pending" as const,
  },
  {
    id: "4",
    name: "Sony WH-1000XM5 Headphones",
    category: "Audio",
    platform: "Croma",
    currentPrice: "\u20B924,990",
    lowestPrice: "\u20B919,990",
    lastUpdated: "3 hours ago",
    status: "Active" as const,
  },
];

const platformColors: Record<string, string> = {
  Amazon: "bg-yellow-tint text-yellow",
  Flipkart: "bg-blue-tint text-blue",
  Croma: "bg-green-tint text-green",
  Myntra: "bg-pink-tint text-pink",
  "Tata CLiQ": "bg-purple-tint text-purple",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) > 1 ? "s" : ""} ago`;
}

export default function TrackedProductsPage() {
  const [products, setProducts] = useState<DisplayProduct[]>(defaultProducts);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(defaultProducts.length);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", platform: "Amazon", url: "", price: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProducts = () => {
    setLoading(true);
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (data.products) {
          setProducts(
            data.products.map((p: Product) => ({
              id: p.id ?? "",
              name: p.name ?? "Unknown",
              category: p.category ?? "N/A",
              platform: p.platform ?? "Unknown",
              currentPrice: `\u20B9${(p.current_price ?? 0).toLocaleString("en-IN")}`,
              lowestPrice: `\u20B9${(p.lowest_price ?? 0).toLocaleString("en-IN")}`,
              lastUpdated: p.last_checked ? timeAgo(p.last_checked) : "N/A",
              status: p.status === "tracking" ? ("Active" as const) : ("Pending" as const),
              url: p.url,
            }))
          );
          setTotal(data.total ?? data.products.length);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddProduct = async () => {
    if (!addForm.name.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          platform: addForm.platform,
          url: addForm.url || undefined,
          current_price: parseFloat(addForm.price) || 0,
          original_price: parseFloat(addForm.price) || 0,
        }),
      });
      const data = await res.json();
      if (data.product || res.ok) {
        setShowAddModal(false);
        setAddForm({ name: "", platform: "Amazon", url: "", price: "" });
        fetchProducts();
      } else {
        window.alert(data.error ?? "Failed to add product");
      }
    } catch {
      window.alert("Failed to add product");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/products/${id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setTotal((prev) => prev - 1);
    } catch {
      window.alert("Failed to delete product");
    } finally {
      setDeletingId(null);
    }
  };

  const handleScrapeNow = async (product: DisplayProduct) => {
    setScrapingId(product.id);
    try {
      const res = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: product.url, productName: product.name }),
      });
      const data = await res.json();
      if (data.error) {
        window.alert(`Scrape failed: ${data.error}`);
      } else {
        fetchProducts();
      }
    } catch {
      window.alert("Scrape request failed");
    } finally {
      setScrapingId(null);
    }
  };

  const allCategories = ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const filtered = products.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "All" || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center h-64">
          <p className="text-text-secondary">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-10 py-8 space-y-7">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Tracked Products
            </h1>
            <p className="text-text-secondary text-[13px] font-normal mt-1">
              {total.toLocaleString()} products being monitored
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-input border border-border text-text-primary text-sm outline-none focus:border-accent"
            >
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {/* Search */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-lg bg-bg-input border border-border text-text-primary text-sm placeholder:text-text-tertiary outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              + Add Product
            </button>
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center bg-bg-sidebar px-5 py-3 text-text-tertiary text-xs font-medium uppercase tracking-wider">
            <span className="w-[240px]">Product Name</span>
            <span className="w-[100px]">Platform</span>
            <span className="w-[100px]">Category</span>
            <span className="w-[120px]">Current Price</span>
            <span className="w-[120px]">Lowest Price</span>
            <span className="w-[100px]">Last Updated</span>
            <span className="w-[80px]">Status</span>
            <span className="flex-1 text-right">Actions</span>
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-text-tertiary text-sm">
              No products found.
            </div>
          ) : (
            filtered.map((product) => (
              <div
                key={product.id || product.name}
                className="flex items-center px-5 py-4 border-t border-border hover:bg-bg-sidebar/50 transition-colors"
              >
                <span className="w-[240px] text-text-primary text-sm font-medium truncate pr-3">
                  <Link href={`/product/${product.id}`} className="hover:text-accent transition-colors">
                    {product.name}
                  </Link>
                </span>
                <span className="w-[100px]">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      platformColors[product.platform] ?? "bg-bg-sidebar text-text-secondary"
                    }`}
                  >
                    {product.platform}
                  </span>
                </span>
                <span className="w-[100px] text-text-secondary text-sm">
                  {product.category}
                </span>
                <span className="w-[120px] text-text-primary text-sm font-semibold">
                  {product.currentPrice}
                </span>
                <span className="w-[120px] text-success text-sm font-semibold">
                  {product.lowestPrice}
                </span>
                <span className="w-[100px] text-text-tertiary text-sm">
                  {product.lastUpdated}
                </span>
                <span className="w-[80px]">
                  {product.status === "Active" ? (
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-tint text-success">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-tint text-warning">
                      Pending
                    </span>
                  )}
                </span>
                <span className="flex-1 flex items-center justify-end gap-2">
                  <Link
                    href={`/product/${product.id}`}
                    className="px-2.5 py-1 rounded-md bg-accent/10 text-accent text-xs font-medium hover:opacity-80 transition-opacity"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleScrapeNow(product)}
                    disabled={scrapingId === product.id}
                    className="px-2.5 py-1 rounded-md bg-blue-tint text-blue text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                    title="Refresh price by scraping now"
                  >
                    {scrapingId === product.id ? "Scraping..." : "Refresh Price"}
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    disabled={deletingId === product.id}
                    className="px-2.5 py-1 rounded-md bg-red-tint text-red text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                    title="Delete product"
                  >
                    {deletingId === product.id ? "..." : "Delete"}
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">Add New Product</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-text-tertiary hover:text-text-primary text-xl"
              >
                x
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Samsung Galaxy S24 Ultra"
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-placeholder outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Platform
                </label>
                <select
                  value={addForm.platform}
                  onChange={(e) => setAddForm((f) => ({ ...f, platform: e.target.value }))}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="Amazon">Amazon</option>
                  <option value="Flipkart">Flipkart</option>
                  <option value="Croma">Croma</option>
                  <option value="Myntra">Myntra</option>
                  <option value="Tata CLiQ">Tata CLiQ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Product URL
                </label>
                <input
                  type="url"
                  value={addForm.url}
                  onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://www.amazon.in/dp/..."
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-placeholder outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Price (INR)
                </label>
                <input
                  type="number"
                  value={addForm.price}
                  onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="129999"
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-placeholder outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProduct}
                disabled={addLoading || !addForm.name.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {addLoading ? "Adding..." : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
