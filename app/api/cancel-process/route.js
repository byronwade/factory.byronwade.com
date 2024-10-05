let isCancelled = false;

export async function POST() {
  isCancelled = true;
  return new Response(JSON.stringify({ message: 'Process cancelled' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET() {
  return new Response(JSON.stringify({ isCancelled }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT() {
  isCancelled = false;
  return new Response(JSON.stringify({ message: 'Cancellation reset' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}