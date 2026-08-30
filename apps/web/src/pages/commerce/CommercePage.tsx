import { useEffect, useState, useCallback } from "react";
import { ShoppingCart, Package, RefreshCw, Trash2, Plus, CreditCard } from "lucide-react";
import * as commerce from "@/lib/commerce";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

export function CommercePage(){
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [err, setErr]=useState<string|null>(null);
  const [qty, setQty]=useState<Record<string,number>>({});
  const [shipping, setShipping]=useState('{"street":"123 Main","city":"Lagos"}');
  const load=useCallback(async()=>{
    try{
      const p = await commerce.listProducts({limit:20}); setProducts(p.products);
      const c = await commerce.getCart(); setCart(c);
      const o = await commerce.listOrders({limit:20}); setOrders(o.orders);
      const d = await commerce.getDashboard(); setDashboard(d);
      setErr(null);
    }catch(e){ setErr(e instanceof Error? e.message: String(e)); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  async function add(pid:string){
    try{ const q = qty[pid]||1; await commerce.addToCart({productId: pid, quantity: q}); await load(); }catch(e){ setErr(e instanceof Error? e.message:String(e)); }
  }
  async function doCheckout(){
    try{ const addr = JSON.parse(shipping); await commerce.checkout(addr); await load(); }catch(e){ setErr(e instanceof Error? e.message:String(e)); }
  }
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-emerald"/><h1 className="text-2xl font-black text-text-bright">Commerce</h1><Badge variant="emerald">Session 131</Badge></div>
        <Button size="sm" variant="outline" onClick={()=> void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button>
      </div>
      {err? <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}<button className="float-right" onClick={()=> setErr(null)}>✕</button></div>:null}
      {dashboard? <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Orders</div><div className="text-xl font-black text-text-bright">{dashboard.totalOrders}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Revenue</div><div className="text-xl font-black text-text-bright">${dashboard.totalRevenue/100}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">AOV</div><div className="text-xl font-black text-text-bright">{dashboard.avgOrderValue===null? "—": `$${dashboard.avgOrderValue/100}`}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">By status</div><div className="text-xs text-text-bright">{Object.entries(dashboard.ordersByStatus).map(([k,v])=> `${k}:${v}`).join(" ") || "—"}</div></CardContent></Card>
      </div>:null}
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="flex gap-2"><Package className="h-5 w-5"/>Catalog</CardTitle><CardDescription>{products.length} products (empty when ERP has no sync — honest).</CardDescription></CardHeader><CardContent className="space-y-2">
          {products.length? products.map((p:any)=>(
            <div key={p.id} className="flex items-center gap-2 border border-white/10 rounded p-2">
              <div className="flex-1"><div className="font-medium text-text-bright">{p.name}</div><div className="text-xs text-text-muted">${p.price/100} · stock {p.stockQuantity}</div></div>
              <Input type="number" value={qty[p.id]||1} onChange={e=> setQty({...qty,[p.id]: Number(e.target.value)})} className="w-16"/>
              <Button size="sm" onClick={()=> void add(p.id)}><Plus className="h-3 w-3"/>Add</Button>
            </div>
          )): <p className="text-sm text-text-muted">No products in the catalog. Pricing is fail-closed — adding an uncatalogued product to the cart is rejected rather than billed at a placeholder price. Create products via PUT /commerce/products/:id.</p>}
          <div className="flex gap-2"><Input placeholder="productId (cuid) for manual add" id="manualPid" className="flex-1"/><Button size="sm" onClick={()=>{
            const el=document.getElementById("manualPid") as HTMLInputElement; if(!el?.value) return; void add(el.value);
          }}>Add ID</Button></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="flex gap-2"><ShoppingCart className="h-5 w-5"/>Cart</CardTitle><CardDescription>{cart?.items?.length||0} items · subtotal ${cart? cart.subtotal/100:0}</CardDescription></CardHeader><CardContent className="space-y-2">
          {cart?.items?.map((it:any)=>(
            <div key={it.productId} className="flex items-center gap-2 text-sm border border-white/10 rounded p-2">
              <span className="font-mono text-text-bright">{it.productId.slice(0,12)}</span><span>×{it.quantity}</span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={async()=>{ await commerce.updateCartItem(it.productId, it.quantity-1); await load(); }}>-</Button>
                <Button size="sm" variant="ghost" onClick={async()=>{ await commerce.removeFromCart(it.productId); await load(); }}><Trash2 className="h-3 w-3"/></Button>
              </div>
            </div>
          ))}
          {!cart?.items?.length? <p className="text-sm text-text-muted">Cart empty.</p>:null}
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={async()=>{ await commerce.clearCart(); await load(); }}><Trash2 className="h-4 w-4"/>Clear</Button></div>
          <div><div className="text-xs text-text-muted">Shipping address (JSON)</div><Input value={shipping} onChange={e=> setShipping(e.target.value)}/><Button size="sm" className="mt-2" onClick={()=> void doCheckout()}><CreditCard className="h-4 w-4"/>Checkout</Button></div>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Orders</CardTitle></CardHeader><CardContent className="space-y-1">
        {orders.map((o:any)=>(
          <div key={o.id} className="flex items-center gap-2 border border-white/10 rounded p-2 text-sm">
            <Badge variant="slate">{o.status}</Badge><span className="font-mono text-text-bright">{o.id.slice(0,12)}</span><span>${o.total/100}</span><span className="text-text-muted">{o.items?.length} items</span>
          </div>
        ))}
        {!orders.length? <p className="text-sm text-text-muted">No orders.</p>:null}
      </CardContent></Card>
    </div>
  );
}
