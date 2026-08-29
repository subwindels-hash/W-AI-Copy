/**
 * CLIService - Slice 230: CLI command catalog.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { CLICommand, CLICommandGroup } from "@windels/shared";

const LIST_KEY = "dev:cli";
const DETAIL = (id: string) => `dev:cli:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);

function cmd(
  name: string, group: CLICommandGroup, summary: string, usage: string,
  flags: CLICommand["flags"], examples: string[], since = "0.27.0",
): CLICommand {
  return { id: randomUUID(), name, group, summary, usage, flags, examples, sinceVersion: since };
}

export const CLIService = {
  async list(group?: string): Promise<CLICommand[]> {
    const ids = await redis.smembers(LIST_KEY);
    const out: CLICommand[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const c = JSON.parse(raw) as CLICommand;
      if (!group || c.group === group) out.push(c);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
  async seed() {
    const existing = await redis.scard(LIST_KEY);
    if (existing > 0) return;
    const commands: CLICommand[] = [
      cmd("auth login","auth","Authenticate with WINDELS AI OS","windels auth login [--token TOKEN]",
        [{name:"token",description:"Personal access token"},{name:"org",description:"Organization id"}],
        ["windels auth login","windels auth login --token wk_..."]),
      cmd("auth logout","auth","Clear local credentials","windels auth logout",[],[],),
      cmd("app init","app","Create a new WINDELS app","windels app init <name> [--template next|vite|electron]",
        [{name:"template",description:"Starter template",default:"vite"}],
        ["windels app init my-agent --template next"]),
      cmd("app dev","app","Start local dev server (with emulator + hot reload)","windels app dev",
        [{name:"port",description:"Port to listen on",default:"3000"}],
        ["windels app dev","windels app dev --port 4000"]),
      cmd("app build","app","Build the app for production","windels app build",[],[],),
      cmd("agent new","agent","Scaffold a new AI agent","windels agent new <name> [--model gpt-4o|claude|gemini]",
        [{name:"model",description:"Default model",default:"gpt-4o"}],
        ["windels agent new support-co-pilot"]),
      cmd("agent run","agent","Run an agent locally","windels agent run <name> [--input prompt.md]",[],[],),
      cmd("agent deploy","agent","Deploy agent to cloud","windels agent deploy <name> --env staging|production",
        [{name:"env",description:"Target env",required:true,default:"staging"}],[],),
      cmd("workflow new","workflow","Create a new workflow","windels workflow new <name>",[],[],),
      cmd("workflow test","workflow","Run workflow in dry-run mode","windels workflow test <name>",[],[],),
      cmd("deploy","deploy","Deploy to target environment","windels deploy <service> [--canary N]",
        [{name:"canary",description:"Canary percent (0-100)",default:"0"},{name:"env",description:"Target env",default:"production"}],
        ["windels deploy api --canary 5","windels deploy web --env staging"]),
      cmd("env start","env","Start local dev environment (emulator)","windels env start",[],[],),
      cmd("env stop","env","Stop running environment","windels env stop",[],[],),
      cmd("env status","env","Show environment status","windels env status",[],[],),
      cmd("plugin add","plugin","Install a plugin from the marketplace","windels plugin add <slug>",[],[],),
      cmd("plugin ls","plugin","List installed plugins","windels plugin ls",[],[],),
      cmd("dev tunnel","dev","Expose local dev server via secure tunnel","windels dev tunnel",[],[],),
      cmd("db migrate","db","Run pending migrations","windels db migrate",[],[],),
      cmd("db seed","db","Seed database with fixtures","windels db seed [--fixture path]",[],[]),
      cmd("help","help","Show help","windels help [command]",[],[],),
    ];
    for (const c of commands) {
      await redis.set(DETAIL(c.id), SER(c));
      await redis.sadd(LIST_KEY, c.id);
    }
  },
};
