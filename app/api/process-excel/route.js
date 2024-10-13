// app/api/process-excel/route.js

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function POST(req) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const writeProgress = async (message) => {
    console.log('Sending progress:', message);
    await writer.write(encoder.encode(`PROGRESS:${message}\n`));
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

      if (!file) {
        throw new Error('No file uploaded');
      }

      let buffer;
      if (file instanceof Blob) {
        buffer = await file.arrayBuffer();
      } else {
        throw new Error(`Unsupported file format: ${typeof file}`);
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
      const data = [];

      // Assuming the first row is headers
      const headers = worksheet.getRow(1).values.slice(1); // Remove the first empty cell

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          rowData[headers[colNumber - 1]] = cell.value;
        });
        data.push(rowData);
      });

      console.log(`Extracted ${data.length} rows from the Excel file`);

      // Send the JSON data
      const jsonData = JSON.stringify(data, null, 2);
      console.log('Sending JSON data');
      await writer.write(encoder.encode(`JSON:${jsonData}\n`));

      await writeProgress('All data processed (100%)');

      console.log('Processing completed');
    } catch (error) {
      console.error('Error processing file:', error);
      let errorMessage = error.message;
      if (error.message.includes('Failed to load Excel file')) {
        errorMessage = 'The uploaded file is not a valid Excel file. Please ensure you are uploading a valid .xlsx file.';
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
