import { createFileRoute } from '@tanstack/react-router'

// SSE demo route — proves workerd runtime supports progressive SSE chunk delivery.
// Emits 5 timed chunks at 200 ms intervals over a single connection.
export const Route = createFileRoute('/api/demo-stream')({
  server: {
    handlers: {
      GET: () => {
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          async start(controller) {
            for (let i = 1; i <= 5; i++) {
              controller.enqueue(encoder.encode(`data: chunk-${i}\n\n`))
              await new Promise((r) => setTimeout(r, 200))
            }
            controller.close()
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      },
    },
  },
})
