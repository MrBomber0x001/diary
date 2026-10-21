const express = require('express');

function createDiscoveryRouter({ text, fetchPublicResource, htmlAttribute, decodeHtmlText, supportedImages, saveImageBuffer }) {
  const router = express.Router();
  router.get('/lookup', async (req, res) => {
    const kind = String(req.query.kind || '');
    const query = text(req.query.q);
    if (!['book', 'game', 'movie'].includes(kind) || !query || query.length > 200) {
      return res.status(400).json({ error: 'أدخل نوعاً صحيحاً وعنواناً لا يتجاوز ٢٠٠ حرف.' });
    }

    try {
      let results;
      if (kind === 'book') {
        const url = new URL('https://openlibrary.org/search.json');
        url.searchParams.set('q', query);
        url.searchParams.set('limit', '8');
        url.searchParams.set('fields', 'title,author_name,first_publish_year,cover_i,key');
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Open Library returned ${response.status}`);
        const data = await response.json();
        results = (data.docs || []).map(book => ({
          title: book.title || '',
          creator: (book.author_name || []).slice(0, 2).join(', '),
          year: book.first_publish_year || '',
          image: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : '',
          description: book.first_publish_year ? `سنة النشر: ${book.first_publish_year}` : '',
          source: 'Open Library',
          url: book.key ? `https://openlibrary.org${book.key}` : '',
        }));
      } else if (kind === 'movie') {
        const url = `https://v2.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`IMDb returned ${response.status}`);
        const data = await response.json();
        results = (data.d || [])
          .filter(title => title.q === 'feature')
          .slice(0, 8)
          .map(title => ({
            title: title.l || '',
            creator: '',
            year: title.y || '',
            image: title.i?.imageUrl || '',
            description: title.s || '',
            source: 'IMDb',
            url: title.id ? `https://www.imdb.com/title/${encodeURIComponent(title.id)}/` : '',
          }));
      } else {
        const url = new URL('https://en.wikipedia.org/w/api.php');
        url.searchParams.set('action', 'query');
        url.searchParams.set('generator', 'search');
        url.searchParams.set('gsrsearch', `${query} video game`);
        url.searchParams.set('gsrlimit', '8');
        url.searchParams.set('prop', 'pageimages|extracts');
        url.searchParams.set('piprop', 'thumbnail');
        url.searchParams.set('pithumbsize', '600');
        url.searchParams.set('exintro', '1');
        url.searchParams.set('explaintext', '1');
        url.searchParams.set('format', 'json');
        const response = await fetch(url, {
          headers: { 'User-Agent': 'PersonalMemo/1.0 (local media library)' },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
        const data = await response.json();
        results = Object.values(data.query?.pages || {})
          .sort((a, b) => a.index - b.index)
          .map(page => ({
            title: page.title || '',
            creator: '',
            year: '',
            image: page.thumbnail?.source || '',
            description: (page.extract || '').slice(0, 300),
            source: 'Wikipedia',
            url: `https://en.wikipedia.org/?curid=${encodeURIComponent(page.pageid)}`,
          }));
      }
      res.json(results);
    } catch (error) {
      console.error('Personal Memo metadata lookup failed:', error);
      res.status(502).json({ error: 'تعذّر جلب النتائج من الإنترنت. حاول مرة أخرى لاحقاً.' });
    }
  });

  router.post('/bookmarks/preview', async (req, res) => {
    const urlText = text(req.body?.url);
    if (!urlText || urlText.length > 2048) return res.status(400).json({ error: 'أدخل رابطاً صحيحاً.' });
    try {
      const page = await fetchPublicResource(urlText, 1024 * 1024);
      if (page.contentType !== 'text/html' && page.contentType !== 'application/xhtml+xml') {
        return res.status(415).json({ error: 'هذا العنوان لا يعرض صفحة ويب قابلة للمعاينة.' });
      }
      const html = page.buffer.toString('utf8');
      let title = '';
      let image = '';
      const description = '';
      for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const property = htmlAttribute(tag, 'property').toLowerCase();
        const name = htmlAttribute(tag, 'name').toLowerCase();
        const content = decodeHtmlText(htmlAttribute(tag, 'content').trim());
        if (!title && ['og:title', 'twitter:title'].includes(property || name)) title = content;
        if (!image && ['og:image', 'og:image:url', 'twitter:image'].includes(property || name)) image = content;
      }
      if (!title) title = decodeHtmlText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim());
      const descriptionTag = (html.match(/<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*>/i) || [])[0];
      const pageDescription = descriptionTag ? decodeHtmlText(htmlAttribute(descriptionTag, 'content').trim()) : description;
      let imageUrl = '';
      if (image) {
        const absoluteImage = new URL(image, page.url);
        if (['http:', 'https:'].includes(absoluteImage.protocol) && !absoluteImage.username && !absoluteImage.password) {
          const imageData = await fetchPublicResource(absoluteImage.href, 5 * 1024 * 1024);
          if (supportedImages[imageData.contentType]) {
            imageUrl = await saveImageBuffer(req.user.id, imageData.contentType, imageData.buffer);
          }
        }
      }
      res.json({ title: title.slice(0, 300), description: pageDescription.slice(0, 2000), image_url: imageUrl });
    } catch (error) {
      res.status(422).json({ error: error.message || 'تعذّر جلب معاينة الرابط.' });
    }
  });

  return router;
}

module.exports = createDiscoveryRouter;
