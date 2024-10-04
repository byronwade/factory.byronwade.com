// app/api/process-excel/route.js

import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import ExcelJS from 'exceljs';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// Function to calculate cost based on token usage
function calculateCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1000) * 0.03;
  const outputCost = (outputTokens / 1000) * 0.06;
  return Math.max((inputCost + outputCost), 0.01).toFixed(4);  // Ensure minimum cost of $0.01
}

function cleanAndParseJSON(content) {
  try {
    // Remove any leading or trailing whitespace
    content = content.trim();
    
    // Check if the content is already a valid JSON
    try {
      return JSON.parse(content);
    } catch (e) {
      // If it's not valid JSON, continue with cleaning
    }

    // Find the first '[' or '{' and the last ']' or '}'
    const start = content.indexOf('{') !== -1 ? content.indexOf('{') : content.indexOf('[');
    const end = content.lastIndexOf('}') !== -1 ? content.lastIndexOf('}') + 1 : content.lastIndexOf(']') + 1;
    
    if (start === -1 || end === -1) {
      throw new Error('No valid JSON object or array found');
    }
    
    const jsonString = content.slice(start, end);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    console.error('Problematic content:', content);
    return null;
  }
}

async function processBatch(ideas, batchSize = 5, writeProgress) {
  const results = [];
  for (let i = 0; i < ideas.length; i += batchSize) {
    const batch = ideas.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(({ idea, link }) => generateBlogPost(idea, link)));
    results.push(...batchResults);
    if (writeProgress) {
      await writeProgress(`Processed ${Math.min(i + batchSize, ideas.length)} of ${ideas.length} ideas`);
    }
  }
  return results;
}

export async function POST(req) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const writeProgress = async (message) => {
    await writer.write(encoder.encode(`PROGRESS:${message}\n`));
  };

  (async () => {
    try {
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file) {
        throw new Error('No file uploaded');
      }

      await writeProgress('File received, processing...');

      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet(1);
      const ideas = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row
        const idea = row.getCell(1).value;
        const link = row.getCell(2).value;
        if (idea) {
          ideas.push({ idea, link });
        }
      });

      await writeProgress(`Extracted ${ideas.length} ideas from the Excel file`);

      const results = await processBatch(ideas, 5, writeProgress);

      const outputWorkbook = new ExcelJS.Workbook();
      const outputWorksheet = outputWorkbook.addWorksheet('Blog Posts');

      outputWorksheet.columns = [
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Slug', key: 'slug', width: 30 },
        { header: 'Content', key: 'content', width: 100 },
        { header: 'Cost ($)', key: 'cost', width: 15 },
      ];

      results.forEach((blogPost) => {
        outputWorksheet.addRow(blogPost);
      });

      await writeProgress('Creating output Excel file...');

      const bufferOutput = await outputWorkbook.xlsx.writeBuffer();

      await writeProgress('Excel file created, preparing download...');

      const jsonResponse = {
        file: Buffer.from(bufferOutput).toString('base64'),
        filename: "generated_blog_posts.xlsx"
      };

      await writer.write(encoder.encode(`${JSON.stringify(jsonResponse)}\n`));
      await writer.close();
    } catch (error) {
      console.error('Error processing Excel file:', error);
      await writer.write(encoder.encode(`ERROR:${error.message}\n`));
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

async function generateBlogPost(idea, link) {
  try {
    const outline = await generateOutline(idea, link);
    const sections = await Promise.all(outline.sections.map(section => generateSection(section, idea, link)));
    const sources = await generateSources(idea, link);

    // Remove "Section" prefix from headings
    const cleanedSections = sections.map(section => {
      const heading = section.content.split('\n')[0];
      const cleanedHeading = heading.replace(/^#+\s*(?:Section\s*\d+:\s*)?/i, '');
      const content = section.content.replace(heading, `## ${cleanedHeading}`);
      return { ...section, content };
    });

    const content = cleanedSections.map(section => section.content).join('\n\n');
    
    // Remove null links
    const cleanedContent = content.replace(/\[([^\]]+)\]\(null\)/g, '$1');

    const totalTokens = sections.reduce((sum, section) => sum + section.tokens, 0);

    const blogPost = {
      title: outline.title,
      date: new Date().toISOString().split('T')[0],
      slug: generateSlug(outline.title),
      content: cleanedContent,
      sources: sources,
      cost: calculateCost(totalTokens, totalTokens)
    };

    return blogPost;
  } catch (error) {
    console.error('Error generating blog post:', error);
    return {
      title: `Error: ${idea}`,
      date: new Date().toISOString().split('T')[0],
      slug: generateSlug(`Error for ${idea}`),
      content: `Failed to generate content. Error: ${error.message}`,
      sources: [],
      cost: 0.01  // Minimum cost for failed generations
    };
  }
}

async function generateOutline(idea, link) {
  const outlinePrompt = `
Create a detailed outline for a 2,000-3,000 word blog post on the following topic:
"${idea}"

Reference link for additional information: ${link}

Provide the outline in the following JSON format:
{
  "title": "SEO-optimized blog post title",
  "sections": [
    {"heading": "Introduction", "subheadings": []},
    {"heading": "Section 1", "subheadings": []},
    {"heading": "Section 2", "subheadings": []},
    {"heading": "Section 3", "subheadings": []},
    {"heading": "Conclusion", "subheadings": []}
  ]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: outlinePrompt }],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content;
    console.log('Raw outline response:', content);
    const parsedOutline = cleanAndParseJSON(content);    

    if (parsedOutline && parsedOutline.title && Array.isArray(parsedOutline.sections)) {
      return parsedOutline;
    } else {
      throw new Error('Invalid outline format');
    }
  } catch (error) {
    console.error('Error generating outline:', error);
    return {
      title: `${idea}`,
      sections: [
        { heading: "Introduction", subheadings: [] },
        { heading: "Section 1", subheadings: [] },
        { heading: "Section 2", subheadings: [] },
        { heading: "Section 3", subheadings: [] },
        { heading: "Conclusion", subheadings: [] }
      ]
    };
  }
}

async function generateSections(outline, idea) {
  const sectionPrompts = outline.sections.map(section => ({
    heading: section.heading,
    prompt: `Write a detailed section for a blog post about "${idea}":
Heading: ${section.heading}
Subheadings: ${section.subheadings.join(', ')}
Provide at least 200 words of content for this section.`
  }));

  const sectionResults = await Promise.all(sectionPrompts.map(generateSection));
  return sectionResults;
}

async function generateSection(sectionPrompt, idea, link, retries = 3) {
  const isIntroduction = sectionPrompt.heading === "Introduction";
  const isConclusion = sectionPrompt.heading === "Conclusion";
  const prompt = `Write a detailed ${sectionPrompt.heading.toLowerCase()} for a blog post about "${idea}". 
  ${isIntroduction ? "Include context and a clear thesis statement." : ""}
  ${isConclusion ? "Summarize the main points and provide a call to action or final thoughts." : ""}
  Aim for at least ${isIntroduction || isConclusion ? "150" : "300"} words. 
  Integrate relevant links using markdown format. 
  Reference link for additional information: ${link}`;

  while (retries > 0) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.7,
      });

      const content = completion.choices[0].message.content;
      const wordCount = content.split(/\s+/).length;

      if ((isIntroduction && wordCount >= 150) || (isConclusion && wordCount >= 150) || (!isIntroduction && !isConclusion && wordCount >= 300)) {
        return { content: `${content}`, tokens: completion.usage.total_tokens };
      }

      console.log(`Retry for section ${sectionPrompt.heading}: Word count (${wordCount}) too low.`);
      retries--;
    } catch (error) {
      console.error(`Error generating section ${sectionPrompt.heading}:`, error);
      retries--;
    }
  }

  // If all retries fail, return a default content
  const defaultContent = `[Content generation failed for the ${sectionPrompt.heading.toLowerCase()}. Please replace this with your own content of at least ${isIntroduction || isConclusion ? "150" : "300"} words.]`;
  
  return { content: defaultContent, tokens: defaultContent.split(/\s+/).length };
}

async function generateSources(idea, link) {
  const sourcesPrompt = `Provide a list of 3-5 reputable sources for a blog post about "${idea}".
  Reference link for additional information: ${link}
  Return the sources in the following JSON format:
  [{"name": "Source Name", "link": "https://source-link.com"}]`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: sourcesPrompt }],
      max_tokens: 500,
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content;
    console.log('Raw sources response:', content);
    const parsedSources = cleanAndParseJSON(content);    

    if (parsedSources && Array.isArray(parsedSources)) {
      return parsedSources;
    } else {
      console.error('Invalid sources format:', parsedSources);
      // If parsing fails, try to extract URLs from the content
      const urls = content.match(/https?:\/\/[^\s]+/g) || [];
      return urls.map(url => ({ name: "Source", link: url }));
    }
  } catch (error) {
    console.error('Error generating sources:', error);
    return []; // Return an empty array on error
  }
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-');
}