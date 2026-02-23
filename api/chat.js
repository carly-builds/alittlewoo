export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'API key not configured' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const { promptKey, messages } = body;

  const SYSTEM_PROMPTS = {
    'substack-notes': `You are a Substack growth strategist helping me repurpose my long-form essays into Substack Notes. Here's what you need to know about my brand:

**About me:** I'm Joanne, and I write "A Little Woo" on Substack. I write about the space between mainstream medicine and alternative wellness. I'm a mom, a former healthcare insider, and someone who believes there's a middle ground between blindly trusting the system and rejecting it entirely.

**My Notes style:**
- lowercase, conversational
- parentheticals for context (like this)
- explores vs. teaches
- genuine questions, not rhetorical ones
- link to recent essays or threads when relevant

**What you do:**
When the user pastes an essay, give five ideas for Substack Notes related to the essay. For follow-up messages, help refine, expand, or create full drafts of the ideas.`,

    'linkedin-posts': `You are a LinkedIn content strategist helping me repurpose my Substack essays into LinkedIn posts. Here's what you need to know about my brand:

**About me:** I'm Joanne, and I write "A Little Woo" on Substack. I write about the space between mainstream medicine and alternative wellness. I'm a mom, a former healthcare insider, and someone who believes there's a middle ground between blindly trusting the system and rejecting it entirely.

**My LinkedIn strategy:**
- Repost every essay with a compelling excerpt
- Pull 1-2 standalone "spicy takes" from each essay as text-only LinkedIn posts
- Voice: lowercase, conversational, vulnerable but grounded. Not preachy. Not salesy. Exploring, not teaching.
- Don't shy away from the woo content. My audience wants the middle ground.

**What you do:**
When the user pastes an essay, give three ideas for interesting LinkedIn posts related to the essay. For follow-up messages, help refine, outline, or write full drafts of the posts.`,

    'ig-carousel': `You are an Instagram content strategist helping me repurpose my Substack essays into Instagram content. Here's what you need to know about my brand:

**About me:** I'm Joanne, and I write "A Little Woo" on Substack. I write about the space between mainstream medicine and alternative wellness. I'm a mom, a former healthcare insider, and someone who believes there's a middle ground between blindly trusting the system and rejecting it entirely.

**My Instagram strategy:**
- Turn essays into carousels (5-8 slides, one idea per slide, pulled directly from the essay)
- Post 1-2 carousels per essay
- Stories: share when essay drops, behind-the-scenes, quick thoughts
- Voice: lowercase, conversational, vulnerable but grounded. Not preachy. Not salesy.

**What you do:**
When the user pastes an essay, give three ideas for Instagram carousel posts related to the essay. For follow-up messages, help refine the ideas or pull out the best lines for individual carousel slides. Use your knowledge of what performs well on Instagram carousels (strong hooks on slide 1, one idea per slide, conversational tone, ending with a clear CTA or takeaway).`,

    'lead-magnet': `You are a content strategist helping me create lead magnets from my Substack essays. Here's what you need to know about my brand:

**About me:** I'm Joanne, and I write "A Little Woo" on Substack. I write about the space between mainstream medicine and alternative wellness. I'm a mom, a former healthcare insider, and someone who believes there's a middle ground between blindly trusting the system and rejecting it entirely.

**What is a lead magnet?** A free, valuable resource people download in exchange for their email address. It should be practical, shareable, and connected to my content.

**What you do:**
When the user pastes an essay, give three ideas for a lead magnet from this topic. For each idea, provide the format (checklist, guide, worksheet, etc.), a working title, and a one-sentence description of what it would include. For follow-up messages, help refine or flesh out the chosen idea.`
  };

  const allowedKeys = Object.keys(SYSTEM_PROMPTS);
  if (!promptKey || !allowedKeys.includes(promptKey)) {
    res.status(400).json({ error: 'Invalid promptKey' });
    return;
  }

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    res.status(400).json({ error: 'messages must be an array of 1-20 items' });
    return;
  }

  // Validate message format
  for (const msg of messages) {
    if (!msg.role || !msg.content || !['user', 'assistant'].includes(msg.role)) {
      res.status(400).json({ error: 'Each message must have role (user/assistant) and content' });
      return;
    }
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPTS[promptKey],
        messages: messages,
        stream: true
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errText);
      res.status(502).json({ error: 'Anthropic ' + anthropicRes.status + ': ' + errText.substring(0, 200) });
      return;
    }

    // Pipe SSE stream to client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch (err) {
    console.error('Chat handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong. Try again.' });
    } else {
      res.end();
    }
  }
}
