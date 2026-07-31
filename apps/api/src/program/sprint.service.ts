/**
 * SprintService - Slice 206: Sprint Planning Agent.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Sprint, SprintBurndown, Story } from "@windels/shared";

const SPRINT_LIST = "pgm:sprints";
const SPRINT_DETAIL = (id: string) => `pgm:sprint:${id}`;
const STORY_KEY = "pgm:stories";
const STORY_DETAIL = (id: string) => `pgm:story:${id}`;
const COUNTER = "pgm:sprint:counter";
const STORY_COUNTER = "pgm:story:counter";

function iso() { return new Date().toISOString(); }
const ser = <T>(v: T) => JSON.stringify(v);

export const SprintService = {
  async listSprints(): Promise<Sprint[]> {
    const ids = await redis.lrange(SPRINT_LIST, 0, -1);
    const out: Sprint[] = [];
    for (const id of ids) {
      const raw = await redis.get(SPRINT_DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as Sprint);
    }
    return out.sort((a, b) => b.number - a.number);
  },
  async createSprint(input: Partial<Sprint>): Promise<Sprint> {
    const n = await redis.incr(COUNTER);
    const id = randomUUID();
    const start = input.startAt ?? new Date().toISOString();
    const end = input.endAt ?? new Date(Date.now() + 14 * 86400_000).toISOString();
    const s: Sprint = {
      id,
      name: input.name ?? `Sprint ${n}`,
      number: n,
      startAt: start,
      endAt: end,
      status: input.status ?? "planned",
      goal: input.goal ?? "",
      capacityPoints: input.capacityPoints ?? 40,
      committedPoints: 0,
      completedPoints: input.completedPoints ?? 0,
      velocityProjected: Math.round(30 + Math.random() * 15),
      aiSuggestedGoal: input.aiSuggestedGoal ?? `Ship sprint ${n} scope with high confidence; focus on debt reduction and roadmap initiative alignment.`,
    };
    await redis.set(SPRINT_DETAIL(id), ser(s));
    await redis.lpush(SPRINT_LIST, id);
    return s;
  },
  async getSprint(id: string): Promise<Sprint | null> {
    const raw = await redis.get(SPRINT_DETAIL(id));
    return raw ? (JSON.parse(raw) as Sprint) : null;
  },
  async listBacklog(): Promise<Story[]> {
    const ids = await redis.zrange(STORY_KEY, 0, -1);
    const out: Story[] = [];
    for (const id of ids) {
      const raw = await redis.get(STORY_DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as Story);
    }
    return out.sort((a, b) => (a.sprintId ? -1 : 1) - (b.sprintId ? -1 : 1));
  },
  async createStory(input: Partial<Story>): Promise<Story> {
    const n = await redis.incr(STORY_COUNTER);
    const id = randomUUID();
    const suggested = Math.round((input.points as number) ?? (3 + Math.random() * 8));
    const story: Story = {
      id,
      sprintId: input.sprintId ?? null,
      key: `PCOM-${n}`,
      title: input.title ?? `Story ${n}`,
      epic: input.epic,
      points: input.points ?? 0,
      suggestedPoints: suggested,
      suggestSource: "ai_historical",
      status: input.status ?? "backlog",
      assignee: input.assignee,
      tags: input.tags ?? [],
      acceptanceCriteria: input.acceptanceCriteria ?? ["Given …", "When …", "Then …"],
    };
    await redis.set(STORY_DETAIL(id), ser(story));
    await redis.zadd(STORY_KEY, n, id);
    if (story.sprintId) await this._recomputeSprintPoints(story.sprintId);
    return story;
  },
  async assignToSprint(storyId: string, sprintId: string | null): Promise<Story | null> {
    const raw = await redis.get(STORY_DETAIL(storyId));
    if (!raw) return null;
    const story = JSON.parse(raw) as Story;
    const oldSprint = story.sprintId;
    story.sprintId = sprintId;
    if (!story.points && story.suggestedPoints) story.points = story.suggestedPoints;
    await redis.set(STORY_DETAIL(storyId), ser(story));
    if (oldSprint) await this._recomputeSprintPoints(oldSprint);
    if (sprintId) await this._recomputeSprintPoints(sprintId);
    return story;
  },
  async setStoryStatus(storyId: string, status: Story["status"]): Promise<Story | null> {
    const raw = await redis.get(STORY_DETAIL(storyId));
    if (!raw) return null;
    const story = JSON.parse(raw) as Story;
    story.status = status;
    await redis.set(STORY_DETAIL(storyId), ser(story));
    if (story.sprintId) await this._recomputeSprintPoints(story.sprintId);
    return story;
  },
  async _recomputeSprintPoints(sprintId: string) {
    const s = await this.getSprint(sprintId);
    if (!s) return;
    const stories = await this.listBacklog();
    const inSprint = stories.filter((st) => st.sprintId === sprintId);
    s.committedPoints = inSprint.reduce((acc, st) => acc + (st.points || 0), 0);
    s.completedPoints = inSprint.filter((st) => st.status === "done").reduce((acc, st) => acc + (st.points || 0), 0);
    await redis.set(SPRINT_DETAIL(sprintId), ser(s));
  },
  async burndown(sprintId: string): Promise<SprintBurndown | null> {
    const s = await this.getSprint(sprintId);
    if (!s) return null;
    const start = new Date(s.startAt).getTime();
    const end = new Date(s.endAt).getTime();
    const days = Math.max(5, Math.round((end - start) / 86400_000));
    const pts = s.committedPoints || 40;
    const arr: { date: string; remaining: number; ideal: number }[] = [];
    for (let i = 0; i <= days; i++) {
      const ideal = Math.max(0, Math.round(pts - (pts * i / days)));
      const noise = (Math.random() - 0.3) * (pts * 0.12);
      const remaining = Math.max(0, Math.round(ideal + noise));
      arr.push({
        date: new Date(start + i * 86400_000).toISOString().slice(0, 10),
        remaining,
        ideal,
      });
    }
    return { sprintId, days: arr };
  },
};
