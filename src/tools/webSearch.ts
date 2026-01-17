/**
 * Web Search Tool
 * Search the internet using DuckDuckGo (free, no API key needed)
 */

import { ToolDefinition, ToolResult, toolRegistry } from './toolRegistry.js';

// Simple DuckDuckGo search using their instant answer API
const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search the internet for information. Returns search results with titles, URLs, and snippets.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'The search query',
      required: true
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of results to return (default: 5)',
      required: false
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const query = params.query as string;
    const maxResults = (params.maxResults as number) || 5;
    
    try {
      // Use DuckDuckGo HTML search (no API key needed)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Parse results from HTML
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      
      // Simple regex parsing for DuckDuckGo results
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/g;
      
      let match;
      while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
        const url = match[1];
        const title = match[2].trim();
        const snippet = match[3].trim();
        
        if (title && url) {
          results.push({ title, url, snippet });
        }
      }
      
      // Fallback: Try alternative parsing if no results
      if (results.length === 0) {
        const altRegex = /<a[^>]*href="\/\/duckduckgo.com\/l\/\?[^"]*uddg=([^&"]*)[^"]*"[^>]*>([^<]*)/g;
        while ((match = altRegex.exec(html)) !== null && results.length < maxResults) {
          const url = decodeURIComponent(match[1]);
          const title = match[2].trim();
          
          if (title && url && !url.includes('duckduckgo.com')) {
            results.push({ title, url, snippet: '' });
          }
        }
      }
      
      if (results.length === 0) {
        return { success: true, data: 'No search results found' };
      }
      
      const formatted = results.map((r, i) => 
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
      ).join('\n\n');
      
      return { success: true, data: formatted };
    } catch (error) {
      return { 
        success: false, 
        error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// Fetch URL content tool
const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description: 'Fetch and read the content of a webpage. Returns the text content (HTML stripped).',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL to fetch',
      required: true
    },
    {
      name: 'maxLength',
      type: 'number',
      description: 'Maximum content length to return (default: 5000)',
      required: false
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const url = params.url as string;
    const maxLength = (params.maxLength as number) || 5000;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // Strip HTML tags and extract text
      let text = html
        // Remove scripts and styles
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Remove HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Decode HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim();
      
      // Truncate if needed
      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + '... (truncated)';
      }
      
      return { success: true, data: text };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// Register web tools
export function registerWebTools(): void {
  toolRegistry.register(webSearchTool);
  toolRegistry.register(fetchUrlTool);
}
