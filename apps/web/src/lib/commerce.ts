import { api } from "./api";
import type { CommerceCart, CommerceOrder, CommerceProduct, CommerceDashboard } from "@windels/shared/commerce";
export async function listProducts(params?: Record<string,string|number>) {
  const q = new URLSearchParams(params as any).toString();
  return api<{ products: CommerceProduct[]; total: number }>(`/commerce/products${q?`?${q}`:""}`);
}
export async function getProduct(id:string){ return api<CommerceProduct>(`/commerce/products/${encodeURIComponent(id)}`); }
export async function getCart(){ return api<CommerceCart>(`/commerce/cart`); }
export async function addToCart(body:{productId:string; quantity:number; variantId?:string}){ return api<CommerceCart>(`/commerce/cart/items`,{method:"POST", json: body}); }
export async function updateCartItem(productId:string, quantity:number){ return api<CommerceCart>(`/commerce/cart/items/${encodeURIComponent(productId)}`,{method:"PATCH", json:{ quantity }}); }
export async function removeFromCart(productId:string){ return api<CommerceCart>(`/commerce/cart/items/${encodeURIComponent(productId)}`,{method:"DELETE"}); }
export async function clearCart(){ return api<{cleared:boolean}>(`/commerce/cart`,{method:"DELETE"}); }
export async function checkout(shippingAddress: Record<string,unknown>, billingAddress?: Record<string,unknown>){ return api<CommerceOrder>(`/commerce/checkout`,{method:"POST", json:{ shippingAddress, billingAddress }}); }
export async function listOrders(params?: Record<string,string|number>){ const q=new URLSearchParams(params as any).toString(); return api<{orders:CommerceOrder[]; total:number}>(`/commerce/orders${q?`?${q}`:""}`); }
export async function getOrder(id:string){ return api<CommerceOrder>(`/commerce/orders/${encodeURIComponent(id)}`); }
export async function updateOrderStatus(id:string, status:string){ return api<CommerceOrder>(`/commerce/orders/${encodeURIComponent(id)}/status`,{method:"PATCH", json:{ status }}); }
export async function getDashboard(){ return api<CommerceDashboard>(`/commerce/dashboard`); }
