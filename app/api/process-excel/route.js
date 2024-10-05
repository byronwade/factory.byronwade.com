// app/api/process-excel/route.js

import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import ExcelJS from 'exceljs';
import path from 'path';

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

async function processBatch(ideas, batchSize = 5, writeProgress, checkCancellation) {
  const results = [];
  const totalIdeas = ideas.length;
  let completedIdeas = 0;

  for (let i = 0; i < ideas.length; i += batchSize) {
    const batch = ideas.slice(i, i + batchSize);
    await writeProgress(`BATCH_START:${i + 1}:${Math.min(i + batchSize, ideas.length)}`);
    
    for (const { idea, link } of batch) {
      if (await checkCancellation()) {
        throw new Error('Process cancelled');
      }
      await writeProgress(`PROCESSING:${idea}`);
      const result = await generateBlogPost(idea, link, checkCancellation);
      completedIdeas++;
      await writeProgress(`COMPLETED:${idea}:${result.title}`);
      results.push(result);
      
      // Add a small delay to simulate processing time
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

export async function POST(req) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const writeProgress = async (message) => {
    console.log('Sending progress:', message);
    await writer.write(encoder.encode(`PROGRESS:${message}\n`));
  };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  // Reset the cancellation flag
  await fetch(`${baseUrl}/api/cancel-process`, { method: 'PUT' });

  const checkCancellation = async () => {
    const response = await fetch(`${baseUrl}/api/cancel-process`);
    const data = await response.json();
    if (data.isCancelled) {
      await writeProgress('CANCELLED');
      await writer.write(encoder.encode(`RESET\n`));
      return true;
    }
    return false;
  };

  (async () => {
    try {
      console.log('Processing started');
      const formData = await req.formData();
      console.log('Form data received');
      const file = formData.get('file');
      console.log('File object:', file);
      console.log('File type:', typeof file);
      console.log('File instanceof Blob:', file instanceof Blob);
      console.log('File instanceof File:', file instanceof File);

      if (typeof file === 'object') {
        console.log('File object properties:', Object.getOwnPropertyNames(file));
        console.log('File object prototype:', Object.getPrototypeOf(file));
      }

      if (!file) {
        throw new Error('No file uploaded');
      }

      let buffer;
      if (file instanceof Blob) {
        buffer = await file.arrayBuffer();
      } else if (typeof file === 'string') {
        console.log('File content preview:', file.substring(0, 100));
        if (file.startsWith('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,')) {
          const base64Data = file.split(',')[1];
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          buffer = Buffer.from(file, 'binary');
        }
      } else if (typeof file === 'object') {
        if (file.arrayBuffer) {
          buffer = await file.arrayBuffer();
        } else if (file.buffer) {
          buffer = file.buffer;
        } else {
          console.log('File object keys:', Object.keys(file));
          throw new Error('Unsupported file object format');
        }
      } else {
        throw new Error(`Unsupported file format: ${typeof file}`);
      }

      if (!buffer || buffer.length === 0) {
        throw new Error('File buffer is empty or undefined');
      }

      console.log('Buffer length:', buffer.length);

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(buffer);
      } catch (error) {
        console.error('Error loading Excel file:', error);
        throw new Error(`Failed to load Excel file: ${error.message}. Please ensure you are uploading a valid .xlsx file.`);
      }

      await writeProgress('Excel file loaded (10%)');

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

      console.log(`Extracted ${ideas.length} ideas from the Excel file`);

      const results = await processBatch(ideas, 5, writeProgress, checkCancellation);

      if (await checkCancellation()) return;

      console.log('Blog posts generated');

      await writeProgress('Blog posts generated (90%)');

      let outputData;
      let filename;
      let mimeType;

      const exportFormat = formData.get('exportFormat');

      console.log(`Exporting to ${exportFormat}`);

      switch (exportFormat) {
        case 'excel':
          outputData = await generateExcelOutput(results);
          filename = "generated_blog_posts.xlsx";
          mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          break;
        case 'csv':
          outputData = generateCSVOutput(results);
          filename = "generated_blog_posts.csv";
          mimeType = "text/csv";
          break;
        case 'markdown':
          outputData = generateMarkdownOutput(results);
          filename = "generated_blog_posts.md";
          mimeType = "text/markdown";
          break;
        case 'json':
          outputData = JSON.stringify(results, null, 2);
          filename = "generated_blog_posts.json";
          mimeType = "application/json";
          break;
        case 'pdf':
          outputData = await generatePDFOutput(results);
          filename = "generated_blog_posts.pdf";
          mimeType = "application/pdf";
          break;
        case 'google-sheets':
          const { spreadsheetId, sheetUrl } = await exportToGoogleSheets(buffer);
          console.log('Google Sheets export completed');
          await writeProgress('Google Sheets created, preparing link... (95%)');
          const googleSheetsResponse = {
            url: sheetUrl,
            message: 'Google Sheets document created successfully. Click the link below to open it:'
          };
          console.log('Google Sheets response:', googleSheetsResponse);
          await writer.write(encoder.encode(`GOOGLE_SHEETS:${JSON.stringify(googleSheetsResponse)}\n`));
          await writeProgress('Process completed (100%)');
          return;
        default:
          throw new Error('Unsupported export format');
      }

      if (exportFormat !== 'google-sheets') {
        await writeProgress(`${exportFormat.toUpperCase()} file created, preparing download... (95%)`);
        const jsonResponse = {
          file: Buffer.from(outputData).toString('base64'),
          filename: filename,
          mimeType: mimeType
        };
        await writer.write(encoder.encode(`DATA:${JSON.stringify(jsonResponse)}\n`));
      }

      console.log('Process completed');
      await writeProgress('Process completed (100%)');
    } catch (error) {
      console.error('Error processing file:', error);
      let errorMessage = error.message;
      if (error.code === 'ENOENT' && error.path && error.path.includes('google-credentials.json')) {
        errorMessage = 'Google credentials file not found. Please check your GOOGLE_APPLICATION_CREDENTIALS environment variable.';
      } else if (error.message.includes('is this a zip file ?') || error.message.includes('Failed to load Excel file')) {
        errorMessage = 'The uploaded file is not a valid Excel file. Please ensure you are uploading a valid .xlsx file.';
      } else if (error.code === 'ERR_INVALID_ARG_TYPE') {
        errorMessage = 'Invalid file data received. Please try uploading the file again.';
      } else if (error.message.includes('Google Sheets API')) {
        errorMessage = 'Error accessing Google Sheets API. Please check your credentials and permissions.';
      } else if (error.message.includes('Invalid file format') || error.message.includes('Unsupported file format')) {
        errorMessage = `${error.message}. Please upload a valid Excel (.xlsx) file.`;
      } else {
        errorMessage = `An unexpected error occurred: ${error.message}. Please try again.`;
      }
      console.error('Sending error message:', errorMessage);
      await writer.write(encoder.encode(`ERROR:${errorMessage}\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

async function generateBlogPost(idea, link, checkCancellation) {
  if (await checkCancellation()) throw new Error('Process cancelled');

  // Mock data for testing
  const mockContent = `This is a mock blog post about "${idea}". It contains some sample content for testing purposes. The reference link is: ${link}`;
  const mockSources = [{ name: "Mock Source", link: "https://example.com" }];
  const mockTotalTokens = 100;

  return {
    title: idea,
    content: mockContent,
    sources: mockSources,
    slug: generateSlug(idea),
    date: new Date().toISOString().split('T')[0],
    cost: calculateCost(mockTotalTokens, mockTotalTokens)
  };
}

// Comment out the following functions
// async function generateOutline(idea, link, checkCancellation) { ... }
// async function generateSections(outline, idea, link, checkCancellation) { ... }
// async function generateSection(sectionPrompt, idea, link, checkCancellation, retries = 3) { ... }
// async function generateSources(idea, link, checkCancellation) { ... }

function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-');
}

async function generateExcelOutput(results) {
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

  return await outputWorkbook.xlsx.writeBuffer();
}

function generateCSVOutput(results) {
  const header = "Title,Date,Slug,Content,Cost ($)\n";
  const rows = results.map(post => 
    `"${post.title}","${post.date}","${post.slug}","${post.content.replace(/"/g, '""')}","${post.cost}"`
  ).join("\n");
  return header + rows;
}

function generateMarkdownOutput(results) {
  return results.map(post => `
# ${post.title}

Date: ${post.date}
Slug: ${post.slug}

${post.content}

Cost: $${post.cost}
`).join("\n\n---\n\n");
}

async function generatePDFOutput(results) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  
  results.forEach((post, index) => {
    if (index > 0) doc.addPage();
    doc.setFontSize(18);
    doc.text(post.title, 10, 20);
    doc.setFontSize(12);
    doc.text(doc.splitTextToSize(post.content, 180), 10, 30);
  });
  
  return doc.output('arraybuffer');
}

async function exportToGoogleSheets(buffer) {
  const { google } = require('googleapis');
  const { authenticate } = require('@google-cloud/local-auth');

  const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets'];

  try {
    // Authenticate
    const auth = await authenticate({
      keyfilePath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SCOPES,
    });

    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // Upload the Excel file to Google Drive
    const fileMetadata = {
      name: 'Converted Excel File',
      mimeType: 'application/vnd.google-apps.spreadsheet',
    };
    const media = {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: buffer,
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    const spreadsheetId = file.data.id;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // Set the spreadsheet to be publicly accessible
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    console.log('Spreadsheet created with ID:', spreadsheetId);
    console.log('Sheet URL:', sheetUrl);

    return { spreadsheetId, sheetUrl };
  } catch (error) {
    console.error('Error in exportToGoogleSheets:', error);
    throw error;
  }
}