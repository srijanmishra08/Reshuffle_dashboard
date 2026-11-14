import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFreelancer, listFreelancers } from "@/server/services/freelancers";
import { requireStaff } from "@/server/authz";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const createFreelancerSchema = z.object({
  freelancer: z.string().min(1),
  skill: z.string().optional().default(""),
  category: z.string().optional().default(""),
  company: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  whatsapp: z.string().optional().default(""),
  instagram: z.string().optional().default(""),
  linkedin: z.string().optional().default(""),
  xHandle: z.string().optional().default(""),
  website: z.string().optional().default(""),
  availability: z.string().optional().default(""),
  project: z.string().optional().default(""),
  utilization: z.string().optional().default(""),
  payout: z.string().optional().default(""),
  performance: z.string().optional().default(""),
});

export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const rows = await listFreelancers();
    return NextResponse.json({ data: rows });
  } catch {
    return NextResponse.json({ error: "Could not load freelancers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const body = await request.json();
    const parsedBody = createFreelancerSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
    }

    const created = await createFreelancer(parsedBody.data);


    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create freelancer" }, { status: 500 });
  }
}
