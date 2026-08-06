/**
 * Session 92 — Enterprise ERP dashboard.
 *
 * Product catalog, inventory (stock computed from the movements ledger),
 * suppliers, purchase orders and sales orders with honest lifecycles, plus
 * the CRM hook (won deal → sales order). Every number is computed from
 * stored records — no fabricated data; fresh orgs show zeros.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { erpApi } from "@/lib/erp";
import { crmApi } from "@/lib/crm";
import type {
  ErpOperationsRollup,
  ErpProduct,
  ErpWarehouse,
  ErpSupplier,
  ErpPurchaseOrder,
  ErpSalesOrder,
  ErpStockRow,
} from "@/lib/erp";
import type { CrmDeal } from "@/lib/crm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Package, Warehouse, Truck, ShoppingCart, Boxes, AlertTriangle, PlusCircle, ArrowDownToLine, PackageCheck, Repeat } from "lucide-react";

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

const PO_BADGE: Record<ErpPurchaseOrder["status"], "slate" | "azure" | "emerald" | "danger"> = {
  draft: "slate", submitted: "azure", received: "emerald", cancelled: "danger",
};
const SO_BADGE: Record<ErpSalesOrder["status"], "slate" | "azure" | "emerald" | "danger"> = {
  draft: "slate", confirmed: "azure", fulfilled: "emerald", cancelled: "danger",
};

export function ErpPage() {
  const [rollup, setRollup] = useState<ErpOperationsRollup | null>(null);
  const [products, setProducts] = useState<ErpProduct[]>([]);
  const [warehouses, setWarehouses] = useState<ErpWarehouse[]>([]);
  const [suppliers, setSuppliers] = useState<ErpSupplier[]>([]);
  const [pos, setPos] = useState<ErpPurchaseOrder[]>([]);
  const [sos, setSos] = useState<ErpSalesOrder[]>([]);
  const [stock, setStock] = useState<ErpStockRow[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showProduct, setShowProduct] = useState(false);
  const [pSku, setPSku] = useState("");
  const [pName, setPName] = useState("");
  const [pCat, setPCat] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pCost, setPCost] = useState("");
  const [pReorder, setPReorder] = useState("");

  const [showPO, setShowPO] = useState(false);
  const [poSupplier, setPoSupplier] = useState("");
  const [poProduct, setPoProduct] = useState("");
  const [poQty, setPoQty] = useState("");

  const [showSO, setShowSO] = useState(false);
  const [soProduct, setSoProduct] = useState("");
  const [soQty, setSoQty] = useState("");

  const [dealId, setDealId] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, p, w, s, po, so, st, d] = await Promise.all([
        erpApi.rollup(),
        erpApi.listProducts(),
        erpApi.listWarehouses(),
        erpApi.listSuppliers(),
        erpApi.listPurchaseOrders(),
        erpApi.listSalesOrders(),
        erpApi.inventory(),
        crmApi.listDeals().catch(() => [] as CrmDeal[]),
      ]);
      setRollup(r); setProducts(p); setWarehouses(w); setSuppliers(s);
      setPos(po); setSos(so); setStock(st); setDeals(d);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const productName = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? id;
  }, [products]);
  const supplierName = useMemo(() => {
    const map = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? id;
  }, [suppliers]);

  const createProduct = useCallback(async () => {
    if (!pSku.trim() || !pName.trim()) return;
    try {
      await erpApi.createProduct({
        sku: pSku.trim(), name: pName.trim(), category: pCat.trim() || null,
        priceCents: Math.round((Number(pPrice) || 0) * 100),
        costCents: Math.round((Number(pCost) || 0) * 100),
        reorderLevel: Number(pReorder) || 0,
      });
      setPSku(""); setPName(""); setPCat(""); setPPrice(""); setPCost(""); setPReorder("");
      setShowProduct(false);
      flash("Product created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [pSku, pName, pCat, pPrice, pCost, pReorder, load]);

  const createPO = useCallback(async () => {
    if (!poSupplier || !poProduct || !poQty) return;
    try {
      const product = products.find((p) => p.id === poProduct);
      await erpApi.createPurchaseOrder({
        supplierId: poSupplier,
        status: "submitted",
        items: [{ productId: poProduct, qty: Number(poQty), unitPriceCents: product?.costCents ?? 0 }],
      });
      setPoSupplier(""); setPoProduct(""); setPoQty("");
      setShowPO(false);
      flash("Purchase order submitted.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [poSupplier, poProduct, poQty, products, load]);

  const createSO = useCallback(async () => {
    if (!soProduct || !soQty) return;
    try {
      const product = products.find((p) => p.id === soProduct);
      await erpApi.createSalesOrder({
        status: "confirmed",
        items: [{ productId: soProduct, qty: Number(soQty), unitPriceCents: product?.priceCents ?? 0 }],
      });
      setSoProduct(""); setSoQty("");
      setShowSO(false);
      flash("Sales order confirmed.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [soProduct, soQty, products, load]);

  const receivePO = useCallback(async (id: string) => {
    try {
      await erpApi.receivePurchaseOrder(id);
      flash("PO received — stock movements created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [load]);

  const fulfillSO = useCallback(async (id: string) => {
    try {
      await erpApi.fulfillSalesOrder(id);
      flash("SO fulfilled — sale movements created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [load]);

  const fromDeal = useCallback(async () => {
    if (!dealId) return;
    try {
      const res = await erpApi.createSalesOrderFromDeal(dealId);
      flash(res.matchedProduct
        ? "Sales order created from deal (product matched)."
        : "Sales order created from deal (no product match — review line items).");
      setDealId("");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [dealId, load]);

  const c = rollup?.counts;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Enterprise ERP</h1>
          <p className="text-sm text-text-muted">
            Products, inventory, suppliers, purchase & sales orders — Session 92. Stock is computed from the movements ledger; no fabricated numbers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowProduct(true); setShowPO(false); setShowSO(false); }}>
            <Package className="w-4 h-4 mr-1" /> Product
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowPO(true); setShowProduct(false); setShowSO(false); }} disabled={suppliers.length === 0 || products.length === 0}>
            <ShoppingCart className="w-4 h-4 mr-1" /> Purchase order
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowSO(true); setShowProduct(false); setShowPO(false); }} disabled={products.length === 0}>
            <ArrowDownToLine className="w-4 h-4 mr-1" /> Sales order
          </Button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {/* Quick-create forms */}
      {showProduct || showPO || showSO ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {showProduct ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Input placeholder="SKU" value={pSku} onChange={(e) => setPSku(e.target.value)} />
                  <Input placeholder="Name" value={pName} onChange={(e) => setPName(e.target.value)} />
                  <Input placeholder="Category (optional)" value={pCat} onChange={(e) => setPCat(e.target.value)} />
                  <Input placeholder="Price (USD)" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
                  <Input placeholder="Cost (USD)" value={pCost} onChange={(e) => setPCost(e.target.value)} />
                  <Input placeholder="Reorder level" value={pReorder} onChange={(e) => setPReorder(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createProduct} disabled={!pSku.trim() || !pName.trim()}>Create product</Button>
                  <Button variant="ghost" onClick={() => setShowProduct(false)}>Cancel</Button>
                </div>
              </>
            ) : null}
            {showPO ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)}>
                    <option value="">Supplier…</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <Select value={poProduct} onChange={(e) => setPoProduct(e.target.value)}>
                    <option value="">Product…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <Input placeholder="Qty" type="number" min={1} value={poQty} onChange={(e) => setPoQty(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createPO} disabled={!poSupplier || !poProduct || !poQty}>Submit PO</Button>
                  <Button variant="ghost" onClick={() => setShowPO(false)}>Cancel</Button>
                </div>
              </>
            ) : null}
            {showSO ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={soProduct} onChange={(e) => setSoProduct(e.target.value)}>
                    <option value="">Product…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <Input placeholder="Qty" type="number" min={1} value={soQty} onChange={(e) => setSoQty(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createSO} disabled={!soProduct || !soQty}>Confirm SO</Button>
                  <Button variant="ghost" onClick={() => setShowSO(false)}>Cancel</Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Stat icon={<Package className="w-5 h-5" />} label="Products" value={String(c?.products ?? 0)} sub={`${c?.activeProducts ?? 0} active`} />
        <Stat icon={<Warehouse className="w-5 h-5" />} label="Warehouses" value={String(c?.warehouses ?? 0)} />
        <Stat icon={<Boxes className="w-5 h-5" />} label="Inventory value" value={fmtCents(rollup?.inventoryValueCents ?? 0)} />
        <Stat icon={<Truck className="w-5 h-5" />} label="Suppliers" value={String(c?.suppliers ?? 0)} />
        <Stat icon={<ShoppingCart className="w-5 h-5" />} label="Purchase orders" value={String(c?.purchaseOrders?.submitted ?? 0)} sub={`${fmtCents(rollup?.purchaseOrderTotalsCents ?? 0)} total`} />
        <Stat icon={<ArrowDownToLine className="w-5 h-5" />} label="Sales orders" value={String(c?.salesOrders?.confirmed ?? 0)} sub={`${fmtCents(rollup?.salesOrderTotalsCents ?? 0)} total`} />
        <Stat icon={<AlertTriangle className="w-5 h-5" />} label="Low stock" value={String(rollup?.lowStock.length ?? 0)} />
      </div>

      {/* Low stock + inventory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Low stock</CardTitle>
            <CardDescription>Products below their reorder level (computed from the ledger).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(rollup?.lowStock ?? []).map((l) => (
                <div key={l.productId} className="flex items-center justify-between rounded-lg border border-amber/20 bg-amber/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright truncate">{l.name}</div>
                    <div className="text-xs text-text-muted">{l.sku}</div>
                  </div>
                  <Badge variant="warning">{l.stockOnHand} / reorder {l.reorderLevel}</Badge>
                </div>
              ))}
              {(rollup?.lowStock ?? []).length === 0 ? <p className="text-sm text-text-muted">All stock above reorder levels.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Inventory (computed from movements)</CardTitle>
            <CardDescription>Stock on hand per product and warehouse — always the sum of ledger movements.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stock.map((r) => (
                <div key={`${r.productId}:${r.warehouseId}`} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright truncate">{r.productName} <span className="text-xs text-text-muted">({r.productSku})</span></div>
                    <div className="text-xs text-text-muted">{r.warehouseName} · {fmtCents(r.quantity * r.costCents)} at cost</div>
                  </div>
                  <Badge variant={r.quantity <= 0 ? "danger" : "default"}>{r.quantity} on hand</Badge>
                </div>
              ))}
              {stock.length === 0 ? <p className="text-sm text-text-muted">No stock movements yet — record a receipt or initial stock.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchase + sales orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Purchase orders</CardTitle>
            <CardDescription>Receiving a PO creates real receipt movements in the ledger.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pos.map((po) => (
                <div key={po.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-bright truncate">PO to {supplierName(po.supplierId)}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={PO_BADGE[po.status]}>{po.status}</Badge>
                      {po.status === "submitted" ? <Button size="sm" variant="outline" onClick={() => receivePO(po.id)}>Receive</Button> : null}
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    {po.items.map((i) => `${productName(i.productId)} ×${i.qty}`).join(", ")} · {fmtCents(po.totalCents)}
                  </div>
                </div>
              ))}
              {pos.length === 0 ? <p className="text-sm text-text-muted">No purchase orders.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sales orders</CardTitle>
            <CardDescription>Fulfilling an SO creates real sale movements. Won CRM deals can be converted here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">Convert a CRM deal…</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{d.name} — {fmtCents(d.amountCents)}</option>)}
              </Select>
              <Button onClick={fromDeal} disabled={!dealId}><Repeat className="w-4 h-4 mr-1" />Convert</Button>
            </div>
            <div className="space-y-2">
              {sos.map((so) => (
                <div key={so.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-bright truncate">
                      SO {so.orderDate}{so.customerCompanyId ? " · company-linked" : ""}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={SO_BADGE[so.status]}>{so.status}</Badge>
                      {so.status === "confirmed" ? <Button size="sm" variant="outline" onClick={() => fulfillSO(so.id)}>Fulfill</Button> : null}
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    {so.items.length ? so.items.map((i) => `${productName(i.productId)} ×${i.qty}`).join(", ") : "no line items (from deal)"} · {fmtCents(so.totalCents)}
                  </div>
                  {so.note ? <div className="text-xs text-text-muted truncate">{so.note}</div> : null}
                </div>
              ))}
              {sos.length === 0 ? <p className="text-sm text-text-muted">No sales orders.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products + suppliers + warehouses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Product catalog</CardTitle>
          <CardDescription>Everything the org buys and sells.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {products.map((p) => (
              <div key={p.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-bright truncate">{p.name}</span>
                  <Badge variant={p.isActive ? "emerald" : "slate"}>{p.isActive ? "active" : "inactive"}</Badge>
                </div>
                <div className="text-xs text-text-muted">{p.sku} · {p.category ?? "—"} · {p.unit}</div>
                <div className="text-xs text-text-muted">sells {fmtCents(p.priceCents)} · costs {fmtCents(p.costCents)} · reorder {p.reorderLevel}</div>
              </div>
            ))}
            {products.length === 0 ? <p className="text-sm text-text-muted">No products yet.</p> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-lg">Suppliers</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {suppliers.map((s) => (
                <div key={s.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                  <span className="text-text-bright font-semibold">{s.name}</span>
                  <span className="text-xs text-text-muted"> · {s.contactEmail ?? "no email"} · {s.paymentTerms ?? "—"} · lead {s.leadTimeDays}d</span>
                </div>
              ))}
              {suppliers.length === 0 ? <p className="text-sm text-text-muted">No suppliers yet.</p> : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Warehouses</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {warehouses.map((w) => (
                <div key={w.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                  <span className="text-text-bright font-semibold">{w.name}</span>
                  <span className="text-xs text-text-muted"> · {w.code}{w.isDefault ? " · default" : ""}{w.city ? ` · ${w.city}` : ""}</span>
                </div>
              ))}
              {warehouses.length === 0 ? <p className="text-sm text-text-muted">No warehouses yet.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-azure shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-text-muted uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-black text-text-bright truncate">{value}</div>
          {sub ? <div className="text-xs text-text-muted truncate">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
