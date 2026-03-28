import { pipelineModuleSchema } from "@/server/models/pipeline";
import { subscribeRealtime } from "@/server/services/realtime";

type RouteContext = {
  params: Promise<{ module: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const encoder = new TextEncoder();

function toSseMessage(data: Record<string, unknown>) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request, context: RouteContext) {
  const { module } = await context.params;
  const parsedModule = pipelineModuleSchema.safeParse(module);

  if (!parsedModule.success) {
    return new Response(JSON.stringify({ error: "Invalid module" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const topic = `pipeline:${parsedModule.data}`;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          toSseMessage({
            type: "connected",
            module: parsedModule.data,
            ts: Date.now(),
          })
        )
      );

      const unsubscribe = subscribeRealtime(topic, (event) => {
        controller.enqueue(encoder.encode(toSseMessage(event as unknown as Record<string, unknown>)));
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(
          encoder.encode(
            toSseMessage({
              type: "heartbeat",
              ts: Date.now(),
            })
          )
        );
      }, 25000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
