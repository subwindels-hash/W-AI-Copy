/**
 * Command parser (Phase 2 §6 + §9).
 *
 * The parser is the security boundary in front of execution: whatever it
 * classifies as a command gets run against real WINDELS services, and whatever
 * it marks high-risk cannot run without an explicit confirmation turn. These
 * tests therefore care as much about what it REFUSES to match as what it does.
 */
import { describe, it, expect } from "vitest";
import { parseCommand, hasHighRiskSignal, HELP_TEXT } from "./whatsappCommands.js";

describe("command recognition", () => {
  it("recognises creation commands", () => {
    const cmd = parseCommand("create task follow up with the Lagos supplier");
    expect(cmd?.kind).toBe("create_task");
    expect(cmd?.argument).toBe("follow up with the Lagos supplier");
    // A task is one insert — it answers inline rather than paying for a job.
    expect(cmd?.async).toBe(false);
  });

  it("queues genuinely slow creation work as a background job (§7)", () => {
    for (const [text, kind] of [
      ["create report Q3 revenue", "create_report"],
      ["create advertisement for the new handset", "create_advertisement"],
      ["create music track an upbeat afrobeats intro", "create_music_track"],
      ["run workflow Monthly Invoice Chase", "run_workflow"],
    ] as const) {
      const cmd = parseCommand(text);
      expect(cmd?.kind, text).toBe(kind);
      expect(cmd?.async, text).toBe(true);
    }
  });

  it("recognises inline queries and does not queue them as jobs", () => {
    for (const [text, kind] of [
      ["check sales", "check_sales"],
      ["check campaigns", "check_campaigns"],
      ["check agents", "check_agents"],
      ["pending tasks", "check_pending_tasks"],
    ] as const) {
      const cmd = parseCommand(text);
      expect(cmd?.kind, text).toBe(kind);
      expect(cmd?.async, text).toBe(false);
    }
  });

  it("recognises run workflow and captures the workflow name", () => {
    const cmd = parseCommand("run workflow Monthly Invoice Chase");
    expect(cmd?.kind).toBe("run_workflow");
    expect(cmd?.argument).toBe("Monthly Invoice Chase");
  });

  it("strips a leading separator from the argument", () => {
    expect(parseCommand("create report: Q3 revenue")?.argument).toBe("Q3 revenue");
    expect(parseCommand("create report - Q3 revenue")?.argument).toBe("Q3 revenue");
  });

  it("accepts the slash form as well as natural phrasing", () => {
    expect(parseCommand("/help")?.kind).toBe("help");
    expect(parseCommand("help")?.kind).toBe("help");
  });
});

describe("what is deliberately NOT a command", () => {
  it("treats ordinary conversation as conversation", () => {
    for (const text of [
      "hello there",
      "what do you think of the report I created last week?",
      "can you explain how tasks work in WINDELS?",
      "thanks!",
    ]) {
      expect(parseCommand(text), text).toBeNull();
    }
  });

  it("requires the instruction to start the message, not merely appear in it", () => {
    // Mentioning a command mid-sentence must not trigger execution.
    expect(parseCommand("I was wondering whether you could create task X for me")).toBeNull();
  });

  it("does not treat a long briefing as a slash command", () => {
    const essay = `create a report ${"about the quarterly numbers ".repeat(60)}`;
    expect(essay.length).toBeGreaterThan(1200);
    expect(parseCommand(essay)).toBeNull();
  });

  it("ignores empty and whitespace-only input", () => {
    expect(parseCommand("")).toBeNull();
    expect(parseCommand("    ")).toBeNull();
    expect(parseCommand(null as any)).toBeNull();
  });
});

describe("high-risk detection (§9)", () => {
  it("flags money movement, trading, destructive deletes and credential changes", () => {
    for (const text of [
      "transfer $5000 to account 12345",
      "sell all my BTC now",
      "delete all customer records",
      "change my password to hunter2",
      "remove Jane from the organisation",
    ]) {
      expect(hasHighRiskSignal(text), text).toBe(true);
    }
  });

  it("does not flag ordinary business language", () => {
    for (const text of [
      "check sales",
      "how many campaigns are running?",
      "create task review the budget",
    ]) {
      expect(hasHighRiskSignal(text), text).toBe(false);
    }
  });

  it("escalates a known command to high risk when the text is dangerous", () => {
    const cmd = parseCommand("create task transfer $10,000 to the vendor account");
    expect(cmd?.kind).toBe("create_task");
    // The kind is benign; the content is not. Risk wins.
    expect(cmd?.risk).toBe("high");
  });

  it("returns a help stub — never an executable command — for unmatched dangerous phrasing", () => {
    const cmd = parseCommand("wire the entire treasury balance to this account immediately");
    // The critical property: it must NOT resolve to something executable.
    expect(cmd).not.toBeNull();
    expect(cmd?.kind).toBe("help");
    expect(cmd?.risk).toBe("high");
    expect(cmd?.async).toBe(false);
  });
});

describe("control commands", () => {
  it("parses confirm and cancel in their common phrasings", () => {
    for (const t of ["confirm", "CONFIRM", "/confirm", "yes, confirm", "approve"]) {
      expect(parseCommand(t)?.kind, t).toBe("confirm");
    }
    for (const t of ["cancel", "abort", "stop", "no, cancel"]) {
      expect(parseCommand(t)?.kind, t).toBe("cancel");
    }
  });

  it("parses a request for a human", () => {
    expect(parseCommand("human")?.kind).toBe("handoff");
  });

  it("requires no permissions for control commands", () => {
    expect(parseCommand("confirm")?.requiredPermissions).toEqual([]);
    expect(parseCommand("cancel")?.requiredPermissions).toEqual([]);
    expect(parseCommand("help")?.requiredPermissions).toEqual([]);
  });
});

describe("help text", () => {
  it("documents every user-facing command family", () => {
    for (const fragment of ["create task", "run workflow", "check sales", "human", "confirm"]) {
      expect(HELP_TEXT).toContain(fragment);
    }
  });
});
