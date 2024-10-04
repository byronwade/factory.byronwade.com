'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"

export default function Home() {
  const [file, setFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)
  const [generationProgress, setGenerationProgress] = useState([])
  const [generationComplete, setGenerationComplete] = useState(false)

  const onDrop = useCallback((acceptedFiles) => {
    setFile(acceptedFiles[0])
    setError(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const handleUpload = async () => {
    if (!file) return;
  
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    setGenerationProgress([]);
    setGenerationComplete(false);
  
    const formData = new FormData();
    formData.append('file', file);
  
    try {
      const response = await fetch('/api/process-excel', {
        method: 'POST',
        body: formData,
      });
  
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
  
      let jsonResponse = null;
  
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
  
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
  
        for (const line of lines) {
          if (line.startsWith('PROGRESS:')) {
            setGenerationProgress(prev => [...prev, line.substring(9)]);
          } else if (line.startsWith('{')) {
            // This is likely our JSON response
            jsonResponse = JSON.parse(line);
          }
        }
      }
  
      if (!jsonResponse || !jsonResponse.file) {
        throw new Error('No file data received from server');
      }
  
      // Create a Blob from the base64 encoded string
      const blob = new Blob([Buffer.from(jsonResponse.file, 'base64')], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
  
      // Create a download link and trigger the download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = jsonResponse.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
  
      setGenerationComplete(true);
    } catch (error) {
      console.error('Error uploading file:', error);
      setError(error.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
    }
  };

  return (
    <main className="flex flex-col items-center justify-between min-h-screen p-24">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div {...getRootProps()} className="p-6 text-center border-2 border-gray-300 border-dashed rounded-lg cursor-pointer">
            <input {...getInputProps()} />
            {isDragActive ? (
              <p>Drop the Excel file here ...</p>
            ) : (
              <p>Drag &apos;n&apos; drop an Excel file here, or click to select one</p>
            )}
          </div>
          {file && (
            <p className="mt-2 text-sm text-gray-500">
              Selected file: {file.name}
            </p>
          )}
          <Button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full mt-4"
          >
            {isUploading ? 'Processing...' : 'Process Excel File'}
          </Button>
          {isUploading && (
            <Progress value={uploadProgress} className="mt-2" />
          )}
          {error && (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          )}
          {generationProgress.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-2 text-xl font-bold">Generation Progress:</h2>
              {generationProgress.map((progress, index) => (
                <p key={index}>{progress}</p>
              ))}
            </div>
          )}
          {generationComplete && (
            <p className="mt-4 font-bold text-green-600">Generation complete! Check your downloads for the Excel file.</p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}