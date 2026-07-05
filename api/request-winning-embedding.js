export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ detail: 'Method not allowed' });
  }

  try {
    const ragBaseUrl = process.env.RAG_API_BASE_URL;
    const adminSecret = process.env.ADMIN_EMBED_SECRET;

    if (!ragBaseUrl) {
      return res.status(500).json({
        detail: 'RAG_API_BASE_URL 환경변수가 필요합니다.',
      });
    }

    if (!adminSecret) {
      return res.status(500).json({
        detail: 'ADMIN_EMBED_SECRET 환경변수가 필요합니다.',
      });
    }

    const { id, action = 'embed-one', limit = 30 } = req.body || {};

    if (action === 'embed-one' && !id) {
      return res.status(400).json({
        detail: 'id가 필요합니다.',
      });
    }

    const endpoint = `${String(ragBaseUrl).replace(/\/$/, '')}/api/admin-embeddings`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecret,
      },
      body: JSON.stringify(
        action === 'backfill'
          ? { action: 'backfill', limit }
          : { action: 'embed-one', id }
      ),
    });

    const text = await response.text();

    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        detail: data.detail || data.error || '수행평가 임베딩 API 호출 실패',
        upstream: data,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('request-winning-embedding error:', error);
    return res.status(500).json({
      detail: error?.message || '위닝 임베딩 프록시 처리 중 오류가 발생했습니다.',
    });
  }
}
