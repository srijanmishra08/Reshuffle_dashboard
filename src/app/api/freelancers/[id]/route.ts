import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteFreelancer, updateFreelancer } from "@/server/services/freelancers";
import { publishRealtime } from "@/server/services/realtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const updateFreelancerSchema = z.object({
  freelancer: z.string().min(1).optional(),
  skill: z.string().optional(),
  availability: z.string().optional(),
  project: z.string().optional(),
  utilization: z.string().optional(),
  payout: z.string().optional(),
  performance: z.string().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsedBody = updateFreelancerSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
    }

    const updated = await updateFreelancer(id, parsedBody.data);

    if (!updated) {
      return NextResponse.json({ error: "Freelancer not found" }, { status: 404 });
    }

    publishRealtime("freelancers", {
      type: "freelancer_updated",
      payload: { id },
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Could not update freelancer" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const removed = await deleteFreelancer(id);

    if (!removed) {
      return NextResponse.json({ error: "Freelancer not found" }, { status: 404 });
    }

    publishRealtime("freelancers", {
      type: "freelancer_deleted",
      payload: { id },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete freelancer" }, { status: 500 });
  }
}
