import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { MessageCircle, Users, Briefcase, FileText, FileSignature } from "lucide-react";

interface EntityBreadcrumbProps {
  conversationId?: string | null;
  leadId?: string | null;
  caseId?: string | null;
  proposalId?: string | null;
  contractId?: string | null;
  /** Which entity is the "current" one (won't be a link) */
  current?: "conversation" | "lead" | "case" | "proposal" | "contract";
}

export function EntityBreadcrumb({
  conversationId,
  leadId,
  caseId,
  proposalId,
  contractId,
  current,
}: EntityBreadcrumbProps) {
  const { data: conversation } = useQuery({
    queryKey: ["breadcrumb-conversation", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, contact_name")
        .eq("id", conversationId!)
        .single();
      return data;
    },
    enabled: !!conversationId,
  });

  const { data: lead } = useQuery({
    queryKey: ["breadcrumb-lead", leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, conversation_id")
        .eq("id", leadId!)
        .single();
      return data;
    },
    enabled: !!leadId,
  });

  const { data: caseEntity } = useQuery({
    queryKey: ["breadcrumb-case", caseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("cases")
        .select("id, title, lead_id")
        .eq("id", caseId!)
        .single();
      return data;
    },
    enabled: !!caseId,
  });

  const { data: proposal } = useQuery({
    queryKey: ["breadcrumb-proposal", proposalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("proposals")
        .select("id, title, case_id")
        .eq("id", proposalId!)
        .single();
      return data;
    },
    enabled: !!proposalId,
  });

  // Resolve parent IDs from loaded entities
  const resolvedConversationId = conversationId || lead?.conversation_id;
  const resolvedLeadId = leadId || caseEntity?.lead_id;
  const resolvedCaseId = caseId || proposal?.case_id;

  // Load parent conversation from lead if not directly provided
  const { data: parentConversation } = useQuery({
    queryKey: ["breadcrumb-conversation", resolvedConversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, contact_name")
        .eq("id", resolvedConversationId!)
        .single();
      return data;
    },
    enabled: !!resolvedConversationId && !conversationId,
  });

  // Load parent lead from case if not directly provided
  const { data: parentLead } = useQuery({
    queryKey: ["breadcrumb-lead", resolvedLeadId],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, conversation_id")
        .eq("id", resolvedLeadId!)
        .single();
      return data;
    },
    enabled: !!resolvedLeadId && !leadId,
  });

  // Load parent case from proposal if not directly provided
  const { data: parentCase } = useQuery({
    queryKey: ["breadcrumb-case", resolvedCaseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("cases")
        .select("id, title, lead_id")
        .eq("id", resolvedCaseId!)
        .single();
      return data;
    },
    enabled: !!resolvedCaseId && !caseId,
  });

  const conv = conversation || parentConversation;
  const ld = lead || parentLead;
  const cs = caseEntity || parentCase;
  const pr = proposal;

  const items: { icon: React.ElementType; label: string; to: string; key: string; isCurrent: boolean }[] = [];

  if (conv) {
    items.push({
      icon: MessageCircle,
      label: conv.contact_name,
      to: "/atendimento",
      key: "conversation",
      isCurrent: current === "conversation",
    });
  }

  if (ld) {
    items.push({
      icon: Users,
      label: ld.name,
      to: "/leads",
      key: "lead",
      isCurrent: current === "lead",
    });
  }

  if (cs) {
    items.push({
      icon: Briefcase,
      label: cs.title,
      to: "/casos",
      key: "case",
      isCurrent: current === "case",
    });
  }

  if (pr) {
    items.push({
      icon: FileText,
      label: pr.title,
      to: "/propostas",
      key: "proposal",
      isCurrent: current === "proposal",
    });
  }

  if (contractId) {
    items.push({
      icon: FileSignature,
      label: "Contrato",
      to: "/contratos",
      key: "contract",
      isCurrent: current === "contract",
    });
  }

  if (items.length <= 1) return null;

  return (
    <Breadcrumb className="mb-3">
      <BreadcrumbList>
        {items.map((item, i) => (
          <BreadcrumbItem key={item.key}>
            {i > 0 && <BreadcrumbSeparator />}
            {item.isCurrent ? (
              <BreadcrumbPage className="flex items-center gap-1">
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <Link to={item.to} className="flex items-center gap-1">
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
