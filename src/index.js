// src/index.js - Main Cloudflare Worker for SEO Analysis
import Papa from 'papaparse';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (path) {
        case '/':
          return new Response('SEO Analysis API - Ready', { 
            headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
          });

        case '/upload':
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405, headers: corsHeaders });
          }
          return await handleUpload(request, env);

        case '/analyze':
          if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405, headers: corsHeaders });
          }
          return await handleAnalyze(request, env);

        case '/chat':
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405, headers: corsHeaders });
          }
          return await handleChat(request, env);

        default:
          return new Response('Not found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(`Error: ${error.message}`, { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }
  }
};

// Handle Screaming Frog CSV upload and processing
async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const csvText = await file.text();
    const sessionId = generateSessionId();

    // Parse CSV with Papa Parse
    const parseResult = Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_')
    });

    if (parseResult.errors.length > 0) {
      console.warn('CSV parsing errors:', parseResult.errors);
    }

    const crawlData = parseResult.data;
    console.log(`Parsed ${crawlData.length} pages from crawl`);

    // Process and analyze the data
    const analysisResults = await processCrawlData(crawlData, sessionId, env);

    return new Response(JSON.stringify({
      success: true,
      sessionId: sessionId,
      totalPages: crawlData.length,
      analysis: analysisResults
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process upload',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Process crawl data and perform quantitative analysis
async function processCrawlData(crawlData, sessionId, env) {
  const quantitativeAnalysis = performQuantitativeAnalysis(crawlData);
  
  // Store data in D1 database
  if (env.DB) {
    await storeCrawlData(crawlData, sessionId, env.DB);
  }

  // Prepare content for AI analysis (batch process for efficiency)
  const contentForAI = prepareContentForAI(crawlData);
  
  // Start qualitative analysis (AI processing)
  const qualitativeAnalysis = await performQualitativeAnalysis(contentForAI, env);

  // Generate strategic insights
  const strategicInsights = generateStrategicInsights(quantitativeAnalysis, qualitativeAnalysis);

  return {
    quantitative: quantitativeAnalysis,
    qualitative: qualitativeAnalysis,
    insights: strategicInsights,
    sessionId: sessionId
  };
}

// Quantitative analysis of crawl data
function performQuantitativeAnalysis(data) {
  const analysis = {
    totalPages: data.length,
    avgWordCount: 0,
    pagesWithMissingTitles: 0,
    pagesWithMissingDescriptions: 0,
    avgTitleLength: 0,
    avgDescriptionLength: 0,
    statusCodeDistribution: {},
    contentLengthDistribution: {
      short: 0,    // < 300 words
      medium: 0,   // 300-1000 words
      long: 0,     // 1000-2500 words
      veryLong: 0  // > 2500 words
    }
  };

  let totalWordCount = 0;
  let totalTitleLength = 0;
  let totalDescLength = 0;
  let validTitles = 0;
  let validDescs = 0;

  data.forEach(page => {
    // Word count analysis
    const wordCount = page.word_count || extractWordCount(page.content) || 0;
    totalWordCount += wordCount;

    // Content length categorization
    if (wordCount < 300) analysis.contentLengthDistribution.short++;
    else if (wordCount < 1000) analysis.contentLengthDistribution.medium++;
    else if (wordCount < 2500) analysis.contentLengthDistribution.long++;
    else analysis.contentLengthDistribution.veryLong++;

    // Title analysis
    const title = page.title || page.page_title || '';
    if (!title || title.trim() === '') {
      analysis.pagesWithMissingTitles++;
    } else {
      totalTitleLength += title.length;
      validTitles++;
    }

    // Meta description analysis
    const description = page.meta_description || page.description || '';
    if (!description || description.trim() === '') {
      analysis.pagesWithMissingDescriptions++;
    } else {
      totalDescLength += description.length;
      validDescs++;
    }

    // Status code distribution
    const statusCode = page.status_code || page.status || 200;
    analysis.statusCodeDistribution[statusCode] = (analysis.statusCodeDistribution[statusCode] || 0) + 1;
  });

  // Calculate averages
  analysis.avgWordCount = Math.round(totalWordCount / data.length);
  analysis.avgTitleLength = validTitles > 0 ? Math.round(totalTitleLength / validTitles) : 0;
  analysis.avgDescriptionLength = validDescs > 0 ? Math.round(totalDescLength / validDescs) : 0;

  return analysis;
}

// Prepare content for AI analysis
function prepareContentForAI(data) {
  return data.slice(0, 50).map(page => ({ // Limit to first 50 pages for initial analysis
    url: page.address || page.url,
    title: page.title || page.page_title || '',
    description: page.meta_description || page.description || '',
    content: (page.content || '').substring(0, 2000), // First 2000 chars
    h1: page.h1_1 || page.h1 || '',
    wordCount: page.word_count || extractWordCount(page.content) || 0
  })).filter(page => page.title || page.content);
}

// AI-powered qualitative analysis
async function performQualitativeAnalysis(contentData, env) {
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
    console.log('No AI API keys configured, skipping qualitative analysis');
    return { 
      topics: {}, 
      tones: {}, 
      contentTypes: {},
      message: 'AI analysis requires API key configuration'
    };
  }

  try {
    const analysisPrompt = createAnalysisPrompt(contentData);
    
    let aiResponse;
    if (env.OPENAI_API_KEY) {
      aiResponse = await callOpenAI(analysisPrompt, env.OPENAI_API_KEY);
    } else if (env.ANTHROPIC_API_KEY) {
      aiResponse = await callAnthropic(analysisPrompt, env.ANTHROPIC_API_KEY);
    }

    return parseAIAnalysis(aiResponse);
  } catch (error) {
    console.error('AI analysis error:', error);
    return { 
      topics: {}, 
      tones: {}, 
      contentTypes: {},
      error: 'AI analysis failed: ' + error.message
    };
  }
}

// Create analysis prompt for AI
function createAnalysisPrompt(contentData) {
  const sampleContent = contentData.slice(0, 10); // Analyze first 10 pages as sample
  
  return `Analyze these webpage contents and provide a structured analysis:

${sampleContent.map((page, i) => `
Page ${i + 1}:
URL: ${page.url}
Title: ${page.title}
Description: ${page.description}
Content: ${page.content.substring(0, 500)}...
---`).join('')}

Provide analysis in this JSON format:
{
  "topics": {
    "NFL": number_of_pages,
    "Superbowl": number_of_pages,
    "Player Analysis": number_of_pages,
    "Team Analysis": number_of_pages,
    "Other Sports": number_of_pages,
    "Non-Sports": number_of_pages
  },
  "tones": {
    "casual": number_of_pages,
    "professional": number_of_pages,
    "technical": number_of_pages,
    "passive": number_of_pages
  },
  "contentTypes": {
    "article": number_of_pages,
    "listicle": number_of_pages,
    "guide": number_of_pages,
    "news": number_of_pages,
    "other": number_of_pages
  },
  "insights": ["key insight 1", "key insight 2", "key insight 3"]
}

Base your analysis on the actual content, titles, and descriptions provided.`;
}

// Call OpenAI API
async function callOpenAI(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SEO content analyst. Provide accurate, data-driven analysis in the requested JSON format.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Call Anthropic Claude API
async function callAnthropic(prompt, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Parse AI response
function parseAIAnalysis(aiResponse) {
  try {
    // Extract JSON from response if it's wrapped in text
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : aiResponse;
    
    const parsed = JSON.parse(jsonStr);
    
    return {
      topics: parsed.topics || {},
      tones: parsed.tones || {},
      contentTypes: parsed.contentTypes || {},
      insights: parsed.insights || []
    };
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    return {
      topics: {},
      tones: {},
      contentTypes: {},
      insights: ['AI analysis parsing failed'],
      rawResponse: aiResponse
    };
  }
}

// Generate strategic insights based on analysis
function generateStrategicInsights(quantitative, qualitative) {
  const insights = [];
  
  // Content length insights
  if (quantitative.contentLengthDistribution.short > quantitative.totalPages * 0.3) {
    insights.push({
      type: 'content_length',
      priority: 'medium',
      insight: `${Math.round((quantitative.contentLengthDistribution.short / quantitative.totalPages) * 100)}% of pages have less than 300 words`,
      recommendation: 'Consider expanding thin content pages for better SEO performance'
    });
  }

  // Missing meta elements
  if (quantitative.pagesWithMissingDescriptions > 0) {
    insights.push({
      type: 'meta_optimization',
      priority: 'high',
      insight: `${quantitative.pagesWithMissingDescriptions} pages missing meta descriptions`,
      recommendation: 'Add compelling meta descriptions to improve click-through rates'
    });
  }

  // Topic distribution insights
  if (qualitative.topics) {
    const totalAnalyzed = Object.values(qualitative.topics).reduce((sum, count) => sum + count, 0);
    Object.entries(qualitative.topics).forEach(([topic, count]) => {
      const percentage = Math.round((count / totalAnalyzed) * 100);
      if (percentage > 25) {
        insights.push({
          type: 'content_strategy',
          priority: 'medium',
          insight: `${percentage}% of content focuses on ${topic}`,
          recommendation: `Strong ${topic} content presence - consider expanding related topics`
        });
      }
    });
  }

  return insights;
}

// Store crawl data in D1 database
async function storeCrawlData(data, sessionId, db) {
  try {
    // Create tables if they don't exist
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS crawls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        url TEXT,
        title TEXT,
        meta_description TEXT,
        word_count INTEGER,
        status_code INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Insert data in batches
    const batchSize = 100;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const stmt = db.prepare(`
        INSERT INTO crawls (session_id, url, title, meta_description, word_count, status_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const page of batch) {
        await stmt.bind(
          sessionId,
          page.address || page.url || '',
          page.title || page.page_title || '',
          page.meta_description || page.description || '',
          page.word_count || extractWordCount(page.content) || 0,
          page.status_code || page.status || 200
        ).run();
      }
    }

    console.log(`Stored ${data.length} pages in database`);
  } catch (error) {
    console.error('Database storage error:', error);
    // Don't throw - continue without storage
  }
}

// Handle analysis endpoint
async function handleAnalyze(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Session ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Retrieve analysis from database or cache
  // For now, return a placeholder response
  return new Response(JSON.stringify({
    sessionId,
    message: 'Analysis retrieval not yet implemented'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle chat endpoint for strategic questions
async function handleChat(request, env) {
  const { question, sessionId } = await request.json();
  
  if (!question || !sessionId) {
    return new Response(JSON.stringify({ error: 'Question and session ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // This would integrate with your stored analysis data
  // For now, return a placeholder
  return new Response(JSON.stringify({
    answer: 'Chat functionality will be implemented to answer strategic questions about your content analysis.',
    question,
    sessionId
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Utility functions
function generateSessionId() {
  return 'crawl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function extractWordCount(content) {
  if (!content || typeof content !== 'string') return 0;
  return content.trim().split(/\s+/).filter(word => word.length > 0).length;
}