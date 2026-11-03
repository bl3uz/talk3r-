import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const pos = searchParams.get('offset') || '0';

  const TENOR_KEY = 'LIVDSRZULELA';

  try {
    const endpoint = query.trim()
      ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=24&pos=${pos}&contentfilter=medium`
      : `https://g.tenor.com/v1/trending?key=${TENOR_KEY}&limit=24&pos=${pos}&contentfilter=medium`;

    const res = await fetch(endpoint, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json({ data: [] });
    }

    const json = await res.json();
    const gifs = (json.results || []).map((item: any) => {
      const directUrl = item.media?.[0]?.gif?.url || item.media?.[0]?.tinygif?.url;
      const directPreview = item.media?.[0]?.tinygif?.url || item.media?.[0]?.gif?.url;

      // Routes through your unblocked proxy
      return {
        id: item.id,
        url: `/api/proxy-image?url=${encodeURIComponent(directUrl)}`,
        preview: `/api/proxy-image?url=${encodeURIComponent(directPreview)}`,
        title: item.title,
      };
    });

    return NextResponse.json({ data: gifs, nextPos: json.next || '0' });
  } catch (error) {
    return NextResponse.json({ data: [] });
  }
}