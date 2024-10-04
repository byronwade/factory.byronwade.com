import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Blog Ideas');

  // Add headers
  worksheet.columns = [
    { header: 'Blog Idea', key: 'idea', width: 50 },
    { header: 'Reference Link', key: 'link', width: 50 },
  ];

  // Add some sample data
  const sampleIdeas = [
    { idea: 'The Future of Artificial Intelligence in Healthcare', link: 'https://www.who.int/health-topics/artificial-intelligence' },
    { idea: '10 Essential Tips for Sustainable Living', link: 'https://www.un.org/sustainabledevelopment/sustainable-consumption-production/' },
    { idea: 'How to Start a Successful Online Business in 2024', link: 'https://www.sba.gov/business-guide/10-steps-start-your-business' },
    { idea: 'The Impact of Social Media on Mental Health', link: 'https://www.nimh.nih.gov/health/topics/technology-and-the-brain' },
    { idea: 'Beginners Guide to Cryptocurrency and Blockchain', link: 'https://www.investopedia.com/terms/b/blockchain.asp' },
  ];

  worksheet.addRows(sampleIdeas);

  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer();

  // Set headers for file download
  const headers = new Headers();
  headers.append('Content-Disposition', 'attachment; filename="blog_ideas_example.xlsx"');
  headers.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  return new NextResponse(buffer, { status: 200, headers });
}