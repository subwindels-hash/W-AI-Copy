import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { WorkflowBuilder } from "@/components/workflow/WorkflowBuilder";

export default function WorkflowPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(id ?? null);

  useEffect(() => { setActiveId(id ?? null); }, [id]);

  return (
    <WorkflowBuilder
      workflowId={activeId}
      onOpenWorkflow={(wid) => navigate(`/app/flow/${wid}`)}
      onBack={activeId ? () => navigate("/app/flow") : undefined}
    />
  );
}
