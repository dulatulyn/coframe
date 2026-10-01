"use client";

import { Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { userLanguage } from "@/editor/ui/assistant-panel";
import { errorMessage } from "@/lib/api/client";
import { useAiGenerate, useCreateDiagram, useMe } from "@/lib/api/hooks";

const EXAMPLE =
  "Customers order online. Sales checks the order; rejected orders are cancelled with an email. Accepted orders are packed by the warehouse while finance sends the invoice. If payment doesn't arrive within 14 days, the order is cancelled.";

export function GenerateDialog({
  projectId,
  folderId,
  open,
  onOpenChange,
}: {
  projectId: string;
  folderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data: me } = useMe();
  const generate = useAiGenerate(projectId);
  const createDiagram = useCreateDiagram(projectId);
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<"idle" | "drafting" | "layout">("idle");

  const run = async () => {
    setStage("drafting");
    try {
      const result = await generate.mutateAsync({ description, language: userLanguage() });
      setStage("layout");
      const { layoutProcess } = await import("bpmn-auto-layout");
      const xml = await layoutProcess(result.xml);
      const diagram = await createDiagram.mutateAsync({ folderId, name: result.name, xml });
      toast.success(result.rounds ? `Generated and corrected ${result.rounds}× by the checks` : "Generated");
      onOpenChange(false);
      setDescription("");
      router.push(`/p/${projectId}/${diagram.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setStage("idle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => stage === "idle" && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate a diagram</DialogTitle>
          <DialogDescription>
            Describe the process in your own words. The assistant drafts it, the exact checks verify it, and problems are
            fixed before you see it.
          </DialogDescription>
        </DialogHeader>
        {me?.isGuest ? (
          <div className="rounded-2xl bg-fog p-4 text-[14px] leading-6">
            Generation is available to registered users.
            <Button asChild className="mt-3 w-full">
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        ) : (
          <>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              rows={7}
              placeholder={EXAMPLE}
              disabled={stage !== "idle"}
              className="w-full resize-none rounded-2xl bg-fog px-4 py-3 text-[14px] leading-6 outline-none placeholder:text-slate focus:ring-3 focus:ring-cobalt/25"
            />
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-[13px] text-slate underline-offset-4 hover:text-ink hover:underline"
                onClick={() => setDescription(EXAMPLE)}
                disabled={stage !== "idle"}
              >
                Use the example
              </button>
              <Button onClick={run} disabled={stage !== "idle" || description.trim().length < 3}>
                {stage === "idle" ? <Sparkles /> : <Loader2 className="animate-spin" />}
                {stage === "drafting" ? "Drafting and checking…" : stage === "layout" ? "Laying out…" : "Generate"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
