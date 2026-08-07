import { api } from "./api";
export async function getDashboard(){ return api<any>(`/voice/dashboard`); }
export async function listBuiltin(){ return api<any[]>(`/voice/builtin`); }
export async function listCustom(){ return api<any[]>(`/voice/custom`); }
export async function listPresets(){ return api<any[]>(`/voice/presets`); }
export async function synthesize(text:string, voiceId:string, settings?:any){ return api<any>(`/voice/synthesize`,{method:"POST", json:{ text, voiceId, settings }}); }
export async function listGenerated(){ return api<any[]>(`/voice/generated`); }
export async function listPacks(){ return api<any[]>(`/voice/packs`); }
export async function listDeployments(){ return api<any[]>(`/voice/deployments`); }
