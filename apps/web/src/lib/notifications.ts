import { api } from "./api";
export async function listNotifications(params?: { unreadOnly?: boolean; limit?: number; offset?: number }){
  const q=new URLSearchParams();
  if(params?.unreadOnly) q.set("unreadOnly","true");
  if(params?.limit) q.set("limit", String(params.limit));
  if(params?.offset) q.set("offset", String(params.offset));
  const qs=q.toString()?`?${q}`:"";
  return api<{notifications:any[]; unreadCount:number}>(`/notifications${qs}`);
}
export async function getUnreadCount(){ return api<{count:number}>(`/notifications/unread-count`); }
export async function markRead(id:string){ return api(`/notifications/${encodeURIComponent(id)}/read`,{method:"POST"}); }
export async function markAllRead(){ return api<{markedAsReadCount:number}>(`/notifications/read-all`,{method:"POST"}); }
export async function getPreferences(){ return api<any[]>(`/notifications/preferences`); }
export async function updatePreference(body:{category:string; channels:string[]; enabled:boolean}){ return api(`/notifications/preferences`,{method:"PATCH", json: body}); }
export async function dismiss(id:string){ return api(`/notifications/${encodeURIComponent(id)}`,{method:"DELETE"}); }
