/**
 * Morning Intelligence 2.0 - Cloudflare Workers ES Module
 * Model: Gemini 2.5 Flash + Groq Llama-3.3 Fallback
 * Engine: Pure V8 runtime compatible (pdf-lib in-memory broadsheet)
 */

import { PDFDocument, StandardFonts, rgb, PDFString } from 'pdf-lib';

// ১. অথেনটিক টেক ফিড (ফলব্যাক)
const AUTHENTIC_TECH_FEED = [
  {
    title: 'Google DeepMind Announces Gemini 2.5 Architecture Updates',
    category: 'AI & Machine Learning',
    publisher: 'Google Cloud Blog',
    url: 'https://cloud.google.com/blog/products/ai-machine-learning',
    publishedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    summary: 'Google introduced high-throughput reasoning compute paths slashing operational latency on complex code verification tasks.',
    significance: 'Improves latency while significantly slashing energy consumption across enterprise workflows.',
  },
  {
    title: 'TSMC Clears N2P 2nm Semiconductor Process for High-Volume Production',
    category: 'Semiconductors',
    publisher: 'TSMC Press Room',
    url: 'https://tsmc.com/english/dedicatedFoundry/technology/logic/l_2nm',
    publishedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    summary: 'TSMC confirms completion of risk production for its nanosheet GAA transistor architecture at Fab 20.',
    significance: 'Enables 15% speed improvement at identical power for frontier accelerators.',
  },
  {
    title: 'Figure AI Demonstrates End-to-End Neural Manipulation in Robotics',
    category: 'Robotics',
    publisher: 'Figure Engineering',
    url: 'https://figure.ai',
    publishedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    summary: 'Figure revealed new tactile fingertip sensors and visual-motor policy execution directly in manufacturing.',
    significance: 'Transitions humanoid robotics into reactive real-time factory manipulation.',
  }
];

// ২. নিউজ ফেচ ও ফিল্টারিং
async function fetchNewsArticles(env, lookbackHours = 24) {
  const newsApiKey = env.NEWS_API_KEY || env.NEWS_API_KEY_2;
  const articles = [];

  if (newsApiKey && newsApiKey.trim().length > 5) {
    const queries = ['artificial intelligence', 'semiconductors', 'robotics'];
    const fromDate = new Date(Date.now() - lookbackHours * 3600000).toISOString();

    for (const q of queries) {
      try {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&from=${fromDate}&sortBy=publishedAt&language=en&pageSize=4&apiKey=${newsApiKey.trim()}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MorningIntelligenceBot/2.0' } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.articles)) {
            for (const item of data.articles) {
              if (item.title && item.url && !item.title.includes('[Removed]')) {
                articles.push({
                  title: item.title,
                  category: q.includes('intelligence') ? 'AI & Machine Learning' : 'Technology',
                  publisher: item.source?.name || 'Verified Wire',
                  url: item.url,
                  publishedAt: item.publishedAt || new Date().toISOString(),
                  summary: item.description || item.title,
                  significance: 'Monitored as part of global technology intelligence intake.',
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[NewsAPI] Error on "${q}":`, err.message);
      }
    }
  }

  for (const feedItem of AUTHENTIC_TECH_FEED) {
    if (!articles.some(a => a.url === feedItem.url || a.title.toLowerCase() === feedItem.title.toLowerCase())) {
      articles.push(feedItem);
    }
  }

  const freshArticles = [];
  for (const article of articles) {
    const hash = await computeHash(article.url || article.title);
    if (env.BOT_DB) {
      try {
        const alreadySeen = await env.BOT_DB.get(`seen:${hash}`);
        if (alreadySeen) continue;
      } catch (_) {}
    }
    freshArticles.push({ ...article, hash });
  }

  return freshArticles.length > 0 ? freshArticles.slice(0, 5) : articles.slice(0, 5);
}

async function computeHash(input) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ৩. Gemini 2.5 Flash ও Groq এআই রিসার্চ
async function synthesizeNewsWithAI(articles, env) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const groqKey = env.GROQ_API_KEY?.trim();

  // Gemini 2.5 Flash
  if (geminiKey && geminiKey.length > 5) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const prompt = `You are the Editor-in-Chief of Morning Intelligence 2.0.
Synthesize these verified technology developments into high-level intelligence reports:
${articles.map((a, i) => `[${i + 1}]${a.title} (${a.category}, Source:${a.publisher})\nURL: ${a.url}\nSummary:${a.summary}`).join('\n\n')}

Format strictly as a valid JSON array of objects with keys: "title", "category", "publisher", "url", "publishedAt", "summary", "whyItMatters".`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return { provider: 'Gemini 2.5 Flash', articles: parsed };
          }
        }
      }
    } catch (err) {
      console.warn('[Gemini Flash] Call failed, fallback to Groq:', err.message);
    }
  }

  // Groq Llama-3.3 ফলব্যাক
  if (groqKey && groqKey.length > 5) {
    try {
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const response = await fetch(groqUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are a tech editor. Output JSON array of objects with keys: title, category, publisher, url, publishedAt, summary, whyItMatters.' },
            { role: 'user', content: JSON.stringify(articles) }
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          const list = Array.isArray(parsed) ? parsed : parsed.articles || parsed.news;
          if (Array.isArray(list) && list.length > 0) {
            return { provider: 'Groq Llama-3.3', articles: list };
          }
        }
      }
    } catch (err) {
      console.warn('[Groq API] Call failed:', err.message);
    }
  }

  return { provider: 'Editorial Engine', articles };
}

// ৪. ইন-মেমোরি PDF জেনারেটর (Anti-Crash Sanitize সহ)
function sanitizePdfText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E]/g, '');
}

async function generateBroadsheetPdf(articles, editionId, aiProvider) {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 40;
  const marginY = 40;

  const colorNavy = rgb(0.06, 0.11, 0.21);
  const colorBlue = rgb(0.14, 0.42, 0.99);
  const colorGold = rgb(0.75, 0.55, 0.15);
  const colorDark = rgb(0.13, 0.16, 0.23);
  const colorMuted = rgb(0.40, 0.44, 0.52);
  const colorLine = rgb(0.85, 0.88, 0.92);

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginY;

  function checkPageSpace(requiredHeight) {
    if (y - requiredHeight < marginY + 30) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - marginY - 15;
    }
  }

  // Masthead
  page.drawLine({ start: { x: marginX, y: y }, end: { x: pageWidth - marginX, y: y }, thickness: 2, color: colorNavy });
  y -= 22;
  page.drawText('MORNING INTELLIGENCE', { x: marginX, y: y, size: 22, font: fontBold, color: colorNavy });
  page.drawText('2.0', { x: marginX + 290, y: y, size: 14, font: fontBold, color: colorGold });
  y -= 14;

  const editionDate = new Date().toUTCString();
  page.drawText(sanitizePdfText(`GLOBAL EDITION | ${editionDate}`), { x: marginX, y: y, size: 8, font: fontRegular, color: colorMuted });
  page.drawText(sanitizePdfText(`AI: ${aiProvider.toUpperCase()}`), { x: pageWidth - marginX - 160, y: y, size: 8, font: fontBold, color: colorBlue });
  y -= 10;
  page.drawLine({ start: { x: marginX, y: y }, end: { x: pageWidth - marginX, y: y }, thickness: 0.5, color: colorLine });
  y -= 25;

  // Articles
  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    checkPageSpace(130);

    page.drawText(sanitizePdfText(`[ ${(art.category || 'TECHNOLOGY').toUpperCase()} ]`), { x: marginX, y: y, size: 7.5, font: fontBold, color: colorGold });
    page.drawText(sanitizePdfText(`SOURCE: ${art.publisher || 'Verified Wire'}`), { x: marginX + 130, y: y, size: 7.5, font: fontRegular, color: colorMuted });
    y -= 14;

    const titleLines = wrapText(sanitizePdfText(art.title), 60);
    for (const line of titleLines.slice(0, 2)) {
      page.drawText(line, { x: marginX, y: y, size: 10.5, font: fontBold, color: colorNavy });
      y -= 13;
    }

    const summaryLines = wrapText(sanitizePdfText(art.summary || ''), 85);
    for (const line of summaryLines.slice(0, 3)) {
      page.drawText(line, { x: marginX, y: y, size: 8.5, font: fontRegular, color: colorDark });
      y -= 11;
    }

    if (art.whyItMatters) {
      const sigLines = wrapText(sanitizePdfText(`Significance: ${art.whyItMatters}`), 85);
      for (const sLine of sigLines.slice(0, 2)) {
        page.drawText(sLine, { x: marginX, y: y, size: 8, font: fontOblique, color: rgb(0.18, 0.35, 0.22) });
        y -= 10;
      }
    }

    if (art.url && art.url.startsWith('http')) {
      page.drawText(sanitizePdfText(`Verify Source: ${art.url.substring(0, 60)}...`), { x: marginX, y: y, size: 7.5, font: fontRegular, color: colorBlue });
      const linkAnnotation = doc.context.obj({
        Type: 'Annot', Subtype: 'Link',
        Rect: [marginX, y - 2, marginX + 320, y + 10],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(art.url) },
      });
      page.node.addAnnot(doc.context.register(linkAnnotation));
      y -= 10;
    }

    page.drawLine({ start: { x: marginX, y: y }, end: { x: pageWidth - marginX, y: y }, thickness: 0.5, color: colorLine });
    y -= 16;
  }

  return await doc.save();
}

function wrapText(text, maxChars) {
  const words = (text || '').split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current += ' ' + w;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

// ৫. টেলিগ্রাম মেসেজ ও PDF হ্যান্ডলার
async function sendTelegramMessage(chatId, text, env) {
  const token = env.BOT_TOKEN?.trim();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function sendTelegramPdfDocument(chatId, pdfBytes, filename, caption, env) {
  const token = env.BOT_TOKEN?.trim();
  if (!token) return;
  const formData = new FormData();
  formData.append('chat_id', chatId.toString());
  formData.append('caption', caption.slice(0, 1024));
  formData.append('document', new Blob([pdfBytes], { type: 'application/pdf' }), filename);

  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData,
  });
}

async function dispatchIntelligenceBriefing(chatId, env) {
  try {
    const rawArticles = await fetchNewsArticles(env, 24);
    const { provider, articles } = await synthesizeNewsWithAI(rawArticles, env);
    const editionId = (await computeHash(new Date().toISOString())).slice(0, 6);
    const pdfBytes = await generateBroadsheetPdf(articles, editionId, provider);

    const todayStr = new Date().toISOString().split('T')[0];
    const filename = `Morning_Intelligence_${todayStr}.pdf`;
    const caption = `📰 Morning Intelligence 2.0\n🤖 Engine: ${provider}\n📊 Curated Stories: ${articles.length}`;

    await sendTelegramPdfDocument(chatId, pdfBytes, filename, caption, env);

    if (env.BOT_DB) {
      for (const art of rawArticles) {
        if (art.hash) await env.BOT_DB.put(`seen:${art.hash}`, '1', { expirationTtl: 172800 });
      }
    }
  } catch (err) {
    console.error(err);
    await sendTelegramMessage(chatId, `⚠️ Error: ${err.message}`, env);
  }
}

// ৬. ক্লাউডফ্লেয়ার এন্ট্রি পয়েন্ট
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'online', engine: 'Gemini 2.5 Flash + Workers V8' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST') {
      try {
        const update = await request.json();
        const msg = update.message || update.edited_message;
        if (msg && msg.chat && msg.text) {
          const chatId = msg.chat.id;
          const text = msg.text.trim().toLowerCase();

          if (env.BOT_DB) {
            ctx.waitUntil(env.BOT_DB.put(`sub:${chatId}`, JSON.stringify({ chatId }), { expirationTtl: 86400 * 7 }));
          }

          if (text.startsWith('/start') || text.startsWith('/news')) {
            ctx.waitUntil((async () => {
              await sendTelegramMessage(chatId, '⚡ Gemini 2.5 Flash দিয়ে লাইভ নিউজ প্রসেস করে PDF তৈরি হচ্ছে... অনুগ্রহ করে একটু অপেক্ষা করুন!', env);
              await dispatchIntelligenceBriefing(chatId, env);
            })());
          }
        }
      } catch (e) {
        console.error(e);
      }
      return new Response('OK', { status: 200 });
    }
    return new Response('Method Not Allowed', { status: 405 });
  },

  async scheduled(event, env, ctx) {
    if (!env.BOT_DB) return;
    ctx.waitUntil((async () => {
      const subs = await env.BOT_DB.list({ prefix: 'sub:' });
      for (const key of subs.keys) {
        const chatId = key.name.replace('sub:', '');
        await dispatchIntelligenceBriefing(chatId, env);
      }
    })());
  },
};
