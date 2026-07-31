import { PrismaClient, Role, MembershipRole, TaskStatus, TaskPriority, ActivityType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed starter AI workforce (5 canonical roles per spec §4.2) and
 * a few starter tasks/activities for the bootstrap org so the
 * Universal Workspace dashboard has real data on first load.
 */
const starterAgents = [
  {
    name: "Executor", role: "Task Executor", color: "azure", emoji: "⚡",
    description: "Gets things done — execution, coding, drafting, implementation.",
    systemPrompt: "You are Executor, a results-focused AI employee who turns plans into action. Be concise, concrete, and always return a deliverable.",
    department: "Operations", capabilities: ["execute","code","draft","implement"],
  },
  {
    name: "Researcher", role: "Researcher", color: "violet", emoji: "🔬",
    description: "Deep research, fact-finding, source gathering, synthesis.",
    systemPrompt: "You are Researcher, an AI employee who digs deep, cites sources, and produces well-organized research summaries.",
    department: "Research", capabilities: ["research","summarize","fact-check","search"],
  },
  {
    name: "Analyst", role: "Analyst", color: "teal", emoji: "📊",
    description: "Data analysis, metrics, reports, trend-spotting.",
    systemPrompt: "You are Analyst, an AI employee who turns raw information into insight. Use numbers where possible and separate facts from interpretations.",
    department: "Analytics", capabilities: ["analyze","report","metrics","insights"],
  },
  {
    name: "Creative", role: "Creative", color: "fuchsia", emoji: "✨",
    description: "Ideation, copy, brainstorming, design thinking.",
    systemPrompt: "You are Creative, an AI employee who generates fresh ideas and polished copy. Be vivid, original, and give multiple alternatives when helpful.",
    department: "Creative", capabilities: ["ideate","write","brainstorm","design"],
  },
  {
    name: "Coordinator", role: "Coordinator", color: "amber", emoji: "🧭",
    description: "Project orchestration, planning, cross-agent delegation, status.",
    systemPrompt: "You are Coordinator, an AI employee who plans, prioritizes, and coordinates. Break work into steps, note blockers, and keep things moving.",
    department: "Management", capabilities: ["plan","delegate","coordinate","track"],
  },
] as const;

const starterTasks = [
  { title: "Welcome to WINDELS AI OS", description: "Explore your new workspace. Click any module in the sidebar to get started.", priority: TaskPriority.LOW },
  { title: "Invite your team",          description: "Head to Settings → Members to send invitations.",                               priority: TaskPriority.MEDIUM },
  { title: "Try your first AI chat",    description: "Open AI Chat from the sidebar and ask Windels anything.",                     priority: TaskPriority.MEDIUM },
  { title: "Customize your first agent", description: "Visit Workforce Hub to configure an AI employee.",                          priority: TaskPriority.LOW },
];

async function seedOrgStarterData(orgId: string, workspaceId: string, creatorId: string) {
  const existing = await prisma.agent.count({ where: { organizationId: orgId } });
  if (existing > 0) return;

  for (const a of starterAgents) {
    await prisma.agent.create({
      data: {
        organizationId: orgId,
        name: a.name,
        role: a.role,
        color: a.color,
        emoji: a.emoji,
        description: a.description,
        systemPrompt: a.systemPrompt,
        department: a.department,
        capabilities: a.capabilities,
        isBuiltIn: true,
        status: "ONLINE",
        modelId: "windels-assistant",
      },
    });
  }
  for (const t of starterTasks) {
    await prisma.task.create({
      data: {
        organizationId: orgId,
        workspaceId,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: TaskStatus.TODO,
        progress: 0,
        creatorId,
      },
    });
  }
  await prisma.activity.createMany({
    data: [
      { organizationId: orgId, workspaceId, type: ActivityType.SYSTEM, message: "Workspace initialized." },
      { organizationId: orgId, workspaceId, userId: creatorId, type: ActivityType.USER_JOINED, message: "You joined the workspace." },
    ],
  });
}

async function main() {
  const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL ?? "admin@windels.ai";
  const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD ?? "ChangeMe!234";

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    const passwordHash = await bcrypt.hash(password, 12);
    admin = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: Role.SUPER_ADMIN,
        emailVerifiedAt: new Date(),
        isActive: true,
        profile: { create: { displayName: "Super Admin", theme: "dark" } },
      },
    });
  }

  let org = await prisma.organization.findUnique({ where: { slug: "windels-ai" } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Windels AI",
        slug: "windels-ai",
        settings: { bootstrap: true },
        workspaces: {
          create: { name: "Default Workspace", slug: "default", description: "Default workspace seeded at bootstrap" },
        },
      },
      include: { workspaces: true },
    });
    const existingMember = await prisma.membership.findFirst({
      where: { userId: admin.id, organizationId: org.id },
    });
    if (!existingMember) {
      await prisma.membership.create({
        data: {
          userId: admin.id,
          organizationId: org.id,
          workspaceId: org.workspaces[0]!.id,
          role: MembershipRole.OWNER,
        },
      });
    }
  }

  const defaultWs =
    org.workspaces?.[0] ??
    (await prisma.workspace.findFirst({ where: { organizationId: org.id } }))!;
  await seedOrgStarterData(org.id, defaultWs.id, admin.id);

  console.log(`\n✔ Bootstrap complete.`);
  console.log(`  Super admin: ${email} / ${password}`);
  console.log(`  Org:          ${org.slug}`);
  console.log(`  Workspace:    ${defaultWs.slug}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
