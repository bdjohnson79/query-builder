import { NextResponse } from 'next/server'

// LLM stub — proxies to FastAPI microservice when configured.
// Returns 501 until FASTAPI_BASE_URL is set.

export async function POST(req: Request) {
  const fastApiUrl = process.env.FASTAPI_BASE_URL

  if (!fastApiUrl) {
    return NextResponse.json(
      { error: 'LLM integration not configured. Set FASTAPI_BASE_URL to enable.' },
      { status: 501 }
    )
  }

  try {
    const body = await req.json()
    const upstream = await fetch(`${fastApiUrl}/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
