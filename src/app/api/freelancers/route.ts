import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFreelancer, listFreelancers } from "@/server/services/freelancers";
import { publishRealtime } from "@/server/services/realtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const createFreelancerSchema = z.object({
  freelancer: z.string().min(1),
  skill: z.string().optional().default(""),
  availability: z.string().optional().default(""),
  project: z.string().optional().default(""),
  utilization: z.string().optional().default(""),
  payout: z.string().optional().default(""),
  performance: z.string().optional().default(""),
});

export async function GET() {
  try {
    const rows = await listFreelancers();
    return NextResponse.json({ data: rows });
  } catch {
    return NextResponse.json({ error: "Could not load freelancers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedBody = createFreelancerSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
    }

    const created = await createFreelancer(parsedBody.data);

    publishRealtime("freelancers", {
      type: "freelancer_created",
      payload: { id: created.id },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create freelancer" }, { status: 500 });
  }
}
