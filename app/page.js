'use client'

import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Upload, FileSpreadsheet, FileText, Plus, Sun, Moon, Laptop } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import ProgressDisplay from './progress-display'

export default function Home() {
  const [file, setFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)
  const [generationProgress, setGenerationProgress] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [csvContent, setCsvContent] = useState('')
  const [singlePost, setSinglePost] = useState({ title: '', link: '', image: null })
  const [theme, setTheme] = useState('system')
  const [exportFormat, setExportFormat] = useState('excel')
  const [isProcessing, setIsProcessing] = useState(false)
  const abortControllerRef = useRef(null)

  const onDrop = useCallback((acceptedFiles) => {
    setFile(acceptedFiles[0])
    setError(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/json': ['.json']
    }
  })

  const handleUpload = async (file, exportFormat) => {
    setIsUploading(true);
    setGenerationProgress([]);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('exportFormat', exportFormat);

    try {
      const response = await fetch('/api/process-excel', {
        method: 'POST',
        body: formData
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('PROGRESS:')) {
            const progressMessage = line.slice(9);
            setGenerationProgress(prev => [...prev, { message: progressMessage, status: 'info' }]);
          } else if (line.startsWith('GOOGLE_SHEETS:')) {
            const googleSheetsData = JSON.parse(line.slice(14));
            setGenerationProgress(prev => [
              ...prev,
              { message: googleSheetsData.message, status: 'complete' },
              { message: `<a href="${googleSheetsData.url}" target="_blank" rel="noopener noreferrer">Open Google Sheets</a>`, status: 'complete', isHtml: true }
            ]);
          } else if (line.startsWith('ERROR:')) {
            const errorMessage = line.slice(6);
            setGenerationProgress(prev => [...prev, { message: `Error: ${errorMessage}`, status: 'error' }]);
          }
        }
      }
    } catch (error) {
      console.error('Error during upload:', error);
      setGenerationProgress(prev => [...prev, { message: `Error: ${error.message}`, status: 'error' }]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/generate-example', {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error('Failed to generate example file')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'blog_ideas_example.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading example file:', error)
      setError('Failed to download example file')
    } finally {
      setIsLoading(false)
    }
  }

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
  }

  const getContentType = (filename) => {
    const extension = filename.split('.').pop().toLowerCase()
    switch (extension) {
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      case 'csv':
        return 'text/csv'
      case 'json':
        return 'application/json'
      case 'md':
        return 'text/markdown'
      case 'zip':
        return 'application/zip'
      default:
        return 'application/octet-stream'
    }
  }

  const handleCancel = async () => {
    try {
      const response = await fetch('/api/cancel-process', { method: 'POST' })
      if (!response.ok) {
        throw new Error('Failed to cancel the process')
      }
      setError('Process cancelled')
      setIsProcessing(false)
      setIsUploading(false)
      setFile(null)
      setCsvContent('')
      setSinglePost({ title: '', link: '', image: null })
      setGenerationProgress([])
    } catch (error) {
      console.error('Error cancelling process:', error)
    }
  }

  const handleServerSentEvents = async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('PROGRESS:')) {
          console.log('Received progress update:', line);
          const progressMessage = line.slice(9);
          if (progressMessage.startsWith('PROCESSING:')) {
            const idea = progressMessage.slice(11);
            setGenerationProgress(prev => [...prev, { message: `Processing: ${idea}`, status: 'processing' }]);
          } else if (progressMessage.startsWith('COMPLETED:')) {
            const [idea, title] = progressMessage.slice(10).split(':');
            setGenerationProgress(prev => 
              prev.map(item => 
                item.message === `Processing: ${idea}` ? { ...item, message: `Completed: ${title}`, status: 'complete' } : item
              )
            );
          } else {
            setGenerationProgress(prev => [...prev, { message: progressMessage, status: 'info' }]);
          }
        } else if (line.startsWith('GOOGLE_SHEETS:')) {
          console.log('Received Google Sheets data:', line);
          const googleSheetsData = JSON.parse(line.slice(14));
          setGenerationProgress(prev => [
            ...prev,
            { message: googleSheetsData.message, status: 'complete' },
            { message: `<a href="${googleSheetsData.url}" target="_blank" rel="noopener noreferrer">Open Google Sheets</a>`, status: 'complete', isHtml: true }
          ]);
        } else if (line.startsWith('ERROR:')) {
          console.error('Received error:', line);
          const errorMessage = line.slice(6);
          setGenerationProgress(prev => [...prev, { message: `Error: ${errorMessage}`, status: 'error' }]);
        }
      }
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const base64 = e.target.result;
      const formData = new FormData();
      formData.append('file', base64);
      formData.append('exportFormat', 'excel'); // or whatever format you're using

      // Send formData to the server
      const response = await fetch('/api/process-excel', {
        method: 'POST',
        body: formData
      });

      // Handle the response
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="p-4 shadow-md bg-primary text-primary-foreground">
        <div className="container flex items-center justify-between mx-auto">
          <h1 className="text-2xl font-bold">Content Factory</h1>
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={handleDownload} disabled={isLoading}>
              <Download className="w-4 h-4 mr-2" />
              {isLoading ? 'Generating...' : 'Download Example'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="h-9 w-9">
                  {theme === 'light' && <Sun className="h-[1.2rem] w-[1.2rem]" />}
                  {theme === 'dark' && <Moon className="h-[1.2rem] w-[1.2rem]" />}
                  {theme === 'system' && <Laptop className="h-[1.2rem] w-[1.2rem]" />}
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleThemeChange('light')}>
                  <Sun className="w-4 h-4 mr-2" />
                  <span>Light</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleThemeChange('dark')}>
                  <Moon className="w-4 h-4 mr-2" />
                  <span>Dark</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleThemeChange('system')}>
                  <Laptop className="w-4 h-4 mr-2" />
                  <span>System</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl p-4 mx-auto mt-8">
        <Card className="w-full">
          <CardContent className="p-6">
            <Tabs defaultValue="excel" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="excel">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel/CSV
                </TabsTrigger>
                <TabsTrigger value="json">
                  <FileText className="w-4 h-4 mr-2" />
                  JSON
                </TabsTrigger>
                <TabsTrigger value="text">
                  <FileText className="w-4 h-4 mr-2" />
                  Text Input
                </TabsTrigger>
                <TabsTrigger value="single">
                  <Plus className="w-4 h-4 mr-2" />
                  Single Post
                </TabsTrigger>
              </TabsList>
              <TabsContent value="excel">
                <div
                  {...getRootProps()}
                  className="p-6 text-center transition-colors border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-primary"
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p>Drop the Excel or CSV file here ...</p>
                  ) : (
                    <p>Drag &apos;n&apos; drop an Excel or CSV file here, or click to select one</p>
                  )}
                </div>
                {file && (
                  <p className="mt-2 text-sm text-gray-500">
                    Selected file: {file.name}
                  </p>
                )}
              </TabsContent>
              <TabsContent value="json">
                <div
                  {...getRootProps()}
                  className="p-6 text-center transition-colors border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-primary"
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p>Drop the JSON file here ...</p>
                  ) : (
                    <p>Drag &apos;n&apos; drop a JSON file here, or click to select one</p>
                  )}
                </div>
                {file && (
                  <p className="mt-2 text-sm text-gray-500">
                    Selected file: {file.name}
                  </p>
                )}
              </TabsContent>
              <TabsContent value="text">
                <Textarea
                  placeholder="Paste your content here (CSV format or one title per line)..."
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="min-h-[200px]"
                />
              </TabsContent>
              <TabsContent value="single">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="post-title">Post Title</Label>
                    <Input
                      id="post-title"
                      value={singlePost.title}
                      onChange={(e) => setSinglePost(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter post title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="post-link" className="flex items-center">
                      Post Link
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1 text-gray-500">(optional)</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Adding a link is recommended for better content generation</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="post-link"
                      value={singlePost.link}
                      onChange={(e) => setSinglePost(prev => ({ ...prev, link: e.target.value }))}
                      placeholder="Enter post link (optional)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="post-image">Post Image</Label>
                    <Input
                      id="post-image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSinglePost(prev => ({ ...prev, image: e.target.files[0] }))}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="export-format">Export Format</Label>
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger id="export-format">
                    <SelectValue placeholder="Select export format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="google-sheets">Google Sheets</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="markdown">Markdown</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="zip">Zip (All formats)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? 'Processing...' : 'Process Content'}
                <Upload className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <ProgressDisplay isProcessing={isProcessing} generationProgress={generationProgress} onCancel={handleCancel} />

            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}