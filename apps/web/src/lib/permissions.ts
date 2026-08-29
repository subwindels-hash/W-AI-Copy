import { api } from "./api";
export async function listMyPermissions(){ return api<{role:string|null; permissions:string[]; grants:any[]}>(`/permissions`); }
export async function getCatalog(){ return api<Record<string,string[]>>(`/permissions/catalog`); }
export async function listUserPermissions(userId:string){ return api<{role:string|null; permissions:string[]; grants:any[]}>(`/permissions/users/${encodeURIComponent(userId)}`); }
export async function grant(targetUserId:string, permission:string, resourceId?:string){ return api(`/permissions/grant`,{method:"POST", json:{ targetUserId, permission, resourceId }}); }
export async function revoke(grantId:string){ return api(`/permissions/grant/${encodeURIComponent(grantId)}`,{method:"DELETE"}); }
export async function check(permission:string){ return api<{hasPermission:boolean}>(`/permissions/check?permission=${encodeURIComponent(permission)}`); }
