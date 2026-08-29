import { api } from "./api";
export async function listPlatforms(){ return api<any[]>(`/publishing/platforms`); }
export async function getStatus(platform:string){ return api<any>(`/publishing/${platform}/status`); }
export async function connectStart(platform:string){ return api<any>(`/publishing/${platform}/connect/start`,{method:"POST"}); }
export async function disconnect(platform:string){ return api<any>(`/publishing/${platform}/connect`,{method:"DELETE"}); }
export async function listJobs(){ return api<any[]>(`/publishing/jobs`); }
export async function listAudit(){ return api<any[]>(`/publishing/audit`); }
export async function listUploads(){ return api<any[]>(`/publishing/uploads`); }
