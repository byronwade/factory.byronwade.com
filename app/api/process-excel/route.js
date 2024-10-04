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
  // Remove any text before the first '{' and after the last '}'
  const jsonString = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return null;
  }
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

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('Invalid Excel file: No worksheet found');
      }

      const ideas = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const idea = row.getCell(1).value;
        if (idea) {
          ideas.push(idea);
        }
      });

      await writeProgress(`Extracted ${ideas.length} ideas from the Excel file`);

      const results = [];
      for (let i = 0; i < ideas.length; i++) {
        const idea = ideas[i];
        try {
          await writeProgress(`Generating blog post ${i + 1} of ${ideas.length}...`);
          const blogPost = await generateBlogPost(idea);
          results.push(blogPost);
          if (blogPost.content.includes("[Content generation failed")) {
            await writeProgress(`Blog post ${i + 1} generated with some failed sections (${blogPost.content.split(/\s+/).length} words, cost: $${blogPost.cost})`);
          } else {
            await writeProgress(`Blog post ${i + 1} generated successfully (${blogPost.content.split(/\s+/).length} words, cost: $${blogPost.cost})`);
          }
        } catch (error) {
          console.error('Error generating blog post for idea:', idea, error);
          results.push({
            title: `Error: ${idea}`,
            date: new Date().toISOString().split('T')[0],
            slug: generateSlug(`Error for ${idea}`),
            content: `Failed to generate content. Error: ${error.message}`,
            cost: 0
          });
          await writeProgress(`Error generating blog post ${i + 1}: ${error.message}`);
        }
      }

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

async function generateBlogPost(idea) {
  try {
    const outline = await generateOutline(idea);
    const sections = await Promise.all(outline.sections.map(section => generateSection(section, idea)));
    const sources = await generateSources(idea);

    const content = sections.map(section => section.content).join('\n\n');
    const totalTokens = sections.reduce((sum, section) => sum + section.tokens, 0);

    const blogPost = {
      title: outline.title,
      date: new Date().toISOString().split('T')[0],
      slug: generateSlug(outline.title),
      content: content,
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

async function generateOutline(idea) {
  const outlinePrompt = `
Create a detailed outline for a 2,000-3,000 word blog post on the following topic:
"${idea}"
Provide the outline in the following JSON format:
{
  "title": "SEO-optimized blog post title",
  "sections": [
    {"heading": "Introduction", "subheadings": ["subheading1", "subheading2"]},
    {"heading": "Main Point 1", "subheadings": ["subheading1", "subheading2"]},
    {"heading": "Main Point 2", "subheadings": ["subheading1", "subheading2"]},
    {"heading": "Main Point 3", "subheadings": ["subheading1", "subheading2"]},
    {"heading": "Conclusion", "subheadings": ["subheading1", "subheading2"]}
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: outlinePrompt }],
      max_tokens: 500,
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content;
    const parsedOutline = cleanAndParseJSON(content);
    
    if (parsedOutline) {
      return parsedOutline;
    } else {
      throw new Error('Failed to parse outline JSON');
    }
  } catch (error) {
    console.error('Error generating outline:', error);
    return {
      title: `Outline for: ${idea}`,
      sections: [
        { heading: "Introduction", subheadings: ["Context", "Thesis"] },
        { heading: "Main Point 1", subheadings: ["Explanation", "Example"] },
        { heading: "Main Point 2", subheadings: ["Explanation", "Example"] },
        { heading: "Main Point 3", subheadings: ["Explanation", "Example"] },
        { heading: "Conclusion", subheadings: ["Summary", "Call to Action"] }
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

async function generateSection(sectionPrompt, idea, retries = 3) {
  const isIntroduction = sectionPrompt.heading === "Introduction";
  const prompt = isIntroduction
    ? `Write an engaging introduction for a blog post about "${idea}". Include context and a clear thesis statement. Aim for at least 150 words.`
    : `Write a detailed section for a blog post about "${idea}":
Heading: ${sectionPrompt.heading}
Subheadings: ${sectionPrompt.subheadings.join(', ')}
Provide at least 200 words of content for this section.`;

  while (retries > 0) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const content = completion.choices[0].message.content;
      const wordCount = content.split(/\s+/).length;

      if ((isIntroduction && wordCount >= 150) || (!isIntroduction && wordCount >= 200)) {
        return { content: `## ${sectionPrompt.heading}\n\n${content}`, tokens: completion.usage.total_tokens };
      }

      console.log(`Retry for section ${sectionPrompt.heading}: Word count (${wordCount}) too low.`);
      retries--;
    } catch (error) {
      console.error(`Error generating section ${sectionPrompt.heading}:`, error);
      retries--;
    }
  }

  // If all retries fail, return a default content
  const defaultContent = isIntroduction
    ? `## Introduction\n\n[This is a placeholder introduction for the blog post about "${idea}". Please replace this with a proper introduction of at least 150 words, providing context and a clear thesis statement.]`
    : `## ${sectionPrompt.heading}\n\n[Content generation failed for this section. Please replace this with your own content of at least 200 words, covering the following subheadings: ${sectionPrompt.subheadings.join(', ')}]`;
  
  return { content: defaultContent, tokens: defaultContent.split(/\s+/).length };
}

async function generateSources(idea) {
  const sourcesPrompt = `Provide a list of 3-5 reputable sources for a blog post about "${idea}".
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
    const parsedSources = cleanAndParseJSON(content);
    
    if (parsedSources) {
      return parsedSources;
    } else {
      throw new Error('Failed to parse sources JSON');
    }
  } catch (error) {
    console.error('Error generating sources:', error);
    return [];
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