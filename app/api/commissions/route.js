const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwJpDn6SlbykmbU4tJEmjTq_ogeOJgnBeRVSJGlfNedmet9ROtyNb8JcxWEUCM6Rl1bMg/exec";

export async function GET() {
  try {
    const res = await fetch(APPS_SCRIPT_URL, { redirect: "follow" });
    const data = await res.text();
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.text();
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    const data = await res.text();
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
