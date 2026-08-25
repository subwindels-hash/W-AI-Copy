/**
 * WINDELS AI OS — AI Commerce (WMPC) console.
 *
 * Product search, cart, checkout and orders. Every monetary value is WMPC's own
 * (amountMinor + currency), forwarded verbatim — never recomputed locally.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShoppingCart, Search, X } from "lucide-react";
import type { WmpcProduct, WmpcCart, WmpcOrder, WmpcMoney } from "@windels/shared";
import { aiCommerceApi } from "@/lib/aiCommerce";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function money(m?: WmpcMoney): string {
  if (!m) return "—";
  const minor = (m.amountMinor ?? 0) / 100;
  const sym = m.currency === "USD" || m.currency === "NGN" ? "" : " ";
  const pre = m.currency === "USD" ? "$" : m.currency === "NGN" ? "₦" : `${m.currency}${sym}`;
  return `${pre}${minor.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function orderTone(s: string): any {
  return s === "delivered" || s === "confirmed" ? "emerald"
    : s === "processing" || s === "shipped" || s === "out_for_delivery" ? "azure"
    : s === "cancelled" || s === "refunded" || s === "returned" ? "crimson" : "slate";
}

export function AiCommercePage() {
  const [cart, setCart] = useState<WmpcCart | null>(null);
  const [orders, setOrders] = useState<WmpcOrder[]>([]);
  const [products, setProducts] = useState<WmpcProduct[]>([]);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [c, o] = await Promise.all([aiCommerceApi.getCart(), aiCommerceApi.listOrders()]);
      setCart(c); setOrders(o);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function search() {
    if (!query.trim()) return;
    setErr(null);
    try {
      const res = await aiCommerceApi.search({ query: query.trim() });
      setProducts(res.products ?? []);
    } catch (e: any) { setErr(e?.message ?? "Search failed"); }
  }

  async function addToCart(id: string) {
    setErr(null);
    try { setCart(await aiCommerceApi.addToCart({ productId: id, quantity: 1 })); }
    catch (e: any) { setErr(e?.message ?? "Add to cart failed"); }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-azure" /> AI Commerce (WMPC)</h1>
          <p className="text-sm text-text-muted">Product search, cart, checkout &amp; orders.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <Card>
        <CardHeader><CardTitle>Search products</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} className="flex-1" />
          <Button onClick={() => void search()}><Search className="h-4 w-4 mr-1"/>Search</Button>
        </CardContent>
      </Card>

      {products.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Results ({products.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-text-muted truncate">{p.description}</div>
                  <div className="text-[11px] text-text-muted">{p.availability}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-azure">{money(p.price)}</span>
                  <Button size="sm" variant="outline" onClick={() => void addToCart(p.id)}>Add to cart</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="cart">
        <TabsList>
          <TabsTrigger value="cart">Cart</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="cart">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {!cart || (cart.items ?? []).length === 0 ? (
                <div className="text-sm text-text-muted">Cart is empty.</div>
              ) : (
                <>
                  {cart.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between border-b border-border/40 py-2 text-sm">
                      <span className="truncate">{it.name}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span>×{it.quantity}</span>
                        <span className="text-azure">{money(it.lineTotal)}</span>
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-medium">Total ({cart.itemCount} items)</span>
                    <span className="text-lg font-semibold text-azure">{money(cart.total)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {orders.length === 0 ? (
                <div className="text-sm text-text-muted">No orders yet.</div>
              ) : orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between border-b border-border/40 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{o.reference ?? o.id}</div>
                    <div className="text-xs text-text-muted">placed {o.placedAt}</div>
                  </div>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-azure">{money(o.total)}</span>
                    <Badge variant={orderTone(o.status)}>{o.status.replace(/_/g, " ")}</Badge>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AiCommercePage;
