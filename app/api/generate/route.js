import { NextResponse } from 'next/server';

const OLLAMA_API_URL = 'http://localhost:11434/api/generate'; // Adjust this URL if your Ollama API is hosted elsewhere

export async function POST(req) {
  const { prompt, idea, referenceLink } = await req.json();

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const writeError = async (message) => {
    console.error('Error in Ollama API:', message);
    await writer.write(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
    await writer.close();
  };

  try {
    console.log('Sending request to Ollama API...');
    const response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama2', // or whichever model you're using with Ollama
        prompt: prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error! status: ${response.status}`);
    }

    console.log('Received response from Ollama API, starting to read...');
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.trim() !== '') {
          try {
            const jsonResponse = JSON.parse(line);
            if (jsonResponse.response) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ content: jsonResponse.response })}\n\n`));
            }
          } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
          }
        }
      }
    }
    console.log('Finished reading response from Ollama API');
  } catch (error) {
    console.error('Error generating content:', error);
    await writeError(error.message);
  } finally {
    await writer.close();
  }

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
