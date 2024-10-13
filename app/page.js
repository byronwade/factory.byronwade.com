'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Upload } from 'lucide-react'
import ProgressDisplay from './progress-display'
import dynamic from 'next/dynamic'
import { saveAs } from 'file-saver';

const GeneratedContentDisplay = dynamic(() => import('./GeneratedContentDisplay'), { ssr: false })

const contentCache = new Map()

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [textInput, setTextInput] = useState('')
  const [jsonData, setJsonData] = useState(null)
  const [generatedContent, setGeneratedContent] = useState([])
  const [generationProgress, setGenerationProgress] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const abortControllerRef = useRef(null)

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    setResponse('')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      setResponse(data.response)
    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpload = async () => {
    if (!file && !textInput) {
      setError('Please select a file or enter text input');
      return;
    }

    setIsUploading(true);
    setGenerationProgress([]);
    setJsonData(null);
    setGeneratedContent([]);

    // Create a new AbortController
    abortControllerRef.current = new AbortController();

    try {
      let data;
      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet);
      } else {
        // Process text input
        const lines = textInput.split('\n').filter(line => line.trim() !== '');
        data = lines.map(line => ({ 'Blog Idea': line.trim(), 'Reference Link': '' }));
      }

      setJsonData(data);
      const totalItems = data.length;

      setGenerationProgress(prev => [...prev, { 
        message: `Starting content generation for ${totalItems} items`, 
        status: 'processing',
        overallProgress: 0
      }]);

      const contentPromises = data.map(async (item, index) => {
        const updateProgress = (progress, message) => {
          setGenerationProgress(prev => {
            const newProgress = [...prev];
            const existingItemIndex = newProgress.findIndex(p => p.id === item['Blog Idea']);
            if (existingItemIndex !== -1) {
              newProgress[existingItemIndex] = {
                ...newProgress[existingItemIndex],
                progress: progress,
                message: message
              };
            } else {
              newProgress.push({
                id: item['Blog Idea'],
                message: message,
                status: 'processing',
                progress: progress,
                details: `Item ${index + 1} of ${totalItems}`
              });
            }
            return newProgress;
          });
        };

        try {
          const startTime = Date.now();
          const content = await generateContentWithOllama(item['Blog Idea'], item['Reference Link'], updateProgress, abortControllerRef.current.signal);
          const endTime = Date.now();
          const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
          const wordCount = content.split(/\s+/).length;

          setGenerationProgress(prev => {
            const newProgress = prev.filter(p => p.id !== item['Blog Idea']);
            newProgress.push({
              id: item['Blog Idea'],
              message: `Completed: ${item['Blog Idea']}`,
              status: 'completed',
              progress: 100,
              details: `${wordCount} words generated in ${timeElapsed} seconds`
            });
            return newProgress;
          });

          return { idea: item['Blog Idea'], content, wordCount };
        } catch (error) {
          console.error(`Error generating content for "${item['Blog Idea']}":`, error);
          setGenerationProgress(prev => {
            const newProgress = prev.filter(p => p.id !== item['Blog Idea']);
            newProgress.push({
              id: item['Blog Idea'],
              message: `Error: ${item['Blog Idea']}`,
              status: 'error',
              progress: 0,
              details: error.message
            });
            return newProgress;
          });
          return { idea: item['Blog Idea'], content: `Error: ${error.message}`, wordCount: 0 };
        }
      });

      const results = await Promise.all(contentPromises);
      setGeneratedContent(results);

      setGenerationProgress(prev => [...prev, { 
        message: 'All content generation completed', 
        status: 'completed',
        overallProgress: 100,
        details: `${results.length} items processed successfully`
      }]);
    } catch (error) {
      console.error('Error during upload or content generation:', error);
      setGenerationProgress(prev => [...prev, { 
        message: 'Error during process', 
        status: 'error',
        details: error.message
      }]);
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  };

  const handleExport = () => {
    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // Convert generated content to worksheet data
    const wsData = generatedContent.map(item => ({
      'Blog Idea': item.idea,
      'Content': item.content,
      'Word Count': item.wordCount
    }));

    // Create a worksheet
    const ws = XLSX.utils.json_to_sheet(wsData);

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, "Generated Content");

    // Generate XLSX file
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });

    // Convert to Blob
    const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });

    // Save the file
    saveAs(blob, "generated_content.xlsx");
  };

  // Helper function to convert string to ArrayBuffer
  function s2ab(s) {
    const buf = new ArrayBuffer(s.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
    return buf;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container max-w-3xl p-4 mx-auto mt-8">
        <Card className="w-full">
          <CardContent className="p-6">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt"
              className="mb-4"
            />
            <Input
              type="file"
              accept=".xlsx, .xls"
              onChange={(e) => setFile(e.target.files[0])}
              className="mb-4"
            />
            <Textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter your blog ideas (one per line)"
              className="mb-4"
            />
            <Button
              onClick={handleGenerate}
              disabled={isLoading || !prompt}
              className="w-full"
            >
              {isLoading ? 'Generating...' : 'Generate'}
            </Button>
            {error && <p className="mt-4 text-red-500">{error}</p>}
            {response && (
              <div className="p-4 mt-4 bg-gray-100 rounded">
                <h3 className="font-bold">Response:</h3>
                <p>{response}</p>
              </div>
            )}
            <div className="mt-8">
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
              {generationProgress.length > 0 && (
                <ProgressDisplay progress={generationProgress} />
              )}
            </div>
            <Button
              onClick={handleExport}
              disabled={generatedContent.length === 0}
              className="w-full mt-4"
            >
              Export Generated Content
              <Download className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

const generateContentWithOllama = async (idea, referenceLink, updateProgress, abortSignal) => {
  const cacheKey = `${idea}:${referenceLink}`;
  if (contentCache.has(cacheKey)) {
    updateProgress(100, 'Retrieved from cache');
    return contentCache.get(cacheKey);
  }

  const generateChunk = async (prompt, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, idea, referenceLink }),
          signal: abortSignal
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const reader = response.body.getReader();
        let content = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(5));
              if (data.content) content += data.content;
              else if (data.error) throw new Error(data.error);
            }
          }
        }
        return content;
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(res => setTimeout(res, 1000 * (i + 1)));
      }
    }
  };

  try {
    let fullContent = '';
    const sections = ['Introduction', 'Main Point 1', 'Main Point 2', 'Main Point 3', 'Conclusion'];
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      updateProgress(Math.min((i / sections.length) * 100, 100), `Generating ${section}`);
      
      const sectionPrompt = `Write a detailed and informative ${section} for a blog post about "${idea}".` +
        (referenceLink ? ` Use this reference for context: ${referenceLink}.` : '') +
        ` The content should be original, engaging, and provide valuable insights. Aim for about 200 words.`;
      
      const sectionContent = await generateChunk(sectionPrompt);
      fullContent += `${section}\n\n${sectionContent}\n\n`;

      updateProgress(Math.min(((i + 1) / sections.length) * 100, 100), `Completed ${section}`);
    }

    contentCache.set(cacheKey, fullContent);
    return fullContent;
  } catch (error) {
    console.error('Error in generateContentWithOllama:', error);
    throw error; // Propagate the error to be handled in handleUpload
  }
};